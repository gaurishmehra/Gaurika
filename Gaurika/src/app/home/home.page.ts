import { Component, OnInit, ViewChild, ElementRef, HostListener, Renderer2 } from '@angular/core';
import { Router } from '@angular/router';
import OpenAI from 'openai';
import { Storage } from '@ionic/storage-angular';
import {
  ModalController,
  IonContent,
  Platform,
  LoadingController,
  ToastController,
  AlertController,
  ActionSheetController,
  IonInfiniteScroll
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SettingsService } from '../services/settings.service';
import { WebGroundingService } from '../services/web-grounding.service';
import { Clipboard } from '@capacitor/clipboard';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.7.76/pdf.worker.min.mjs`;
import * as pdfjsLib from 'pdfjs-dist';
import hljs from 'highlight.js'; // Import the core library
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import MarkdownIt from 'markdown-it';
import katex from 'katex';
const markdownItKatex = require('@iktakahiro/markdown-it-katex');



interface Message {
  role: string;
  content: string;
  image?: string | null;
  file?: { name: string; type: string; content: string };
  tool_call_id?: string;
  isToolCallInProgress?: boolean
  name?: string;
  generatedImages?: string[];
  timestamp: Date;
}

interface LearningToolCall {
  action: 'add' | 'remove';
  information: string;
  reason?: string;
}

interface MessagePart {
  type: 'text' | 'code';
  content: string;
  language?: string; // Add language property
  startIndex: number; // To track line numbers correctly for magic selection
}

interface ActionSheetButton {
  text: string;
  role?: 'destructive' | 'cancel';
  icon?: string;
  handler?: () => void;
  disabled?: boolean;
}

// Update the Template interface
interface Template {
  name: string;
  prompt: string;
  description: string;
  category: string;
  icon?: string;
  tags?: string[];
}

interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, any>;
      required: string[];
    };
  };
}
interface ResearchRequest {
  query: string;
  max_results?: number;
}

interface ResearchSource {
  title: string;
  url: string;
  content: string;
  snippet: string;
  fetch_time: string;
}

interface ResearchSummary {
  query: string;
  total_sources: number;
  avg_content_length: number;
  sources: string[];
  titles: string[];
  execution_time: number;
  timestamp: string;
}

interface ResearchResponse {
  summary: ResearchSummary;
  results: ResearchSource[];
  execution_time: number;
}


@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule, CommonModule],
})
export class HomePage implements OnInit {
  // Add version property
  currentSystemPromptVersion = 7; // Keep in sync with settings page
  

  md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: true,
  }).use(markdownItKatex, {
    throwOnError: false,
    errorColor: ' #cc0000',
    output: 'html',
    displayMode: true,
    strict: false,
    trust: true,
    macros: {
      "\\RR": "\\mathbb{R}",
      "\\NN": "\\mathbb{N}",
      "\\ZZ": "\\mathbb{Z}",
      "\\CC": "\\mathbb{C}",
      "\\QQ": "\\mathbb{Q}",
    },
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "$", right: "$", display: false },
      { left: "\\[", right: "\\]", display: true },
      { left: "\\(", right: "\\)", display: false }
    ]
  });

  // Add helper method for math rendering
  sanitizeLatexExpression(latex: string): string {
    // Remove any potentially harmful commands
    latex = latex.replace(/\\(input|include|write|def|let)/g, '');
    
    // Normalize whitespace
    latex = latex.trim().replace(/\s+/g, ' ');
    
    // Ensure proper spacing around operators
    latex = latex.replace(/([=+\-*/])/g, ' $1 ').trim();
    
    return latex;
  }

  // Update the renderMarkdown method
  renderMarkdown(text: string): string {
    // Ensure proper spacing around display math
    text = text.replace(/\$\$(.*?)\$\$/gs, (_, latex) => {
      const sanitized = this.sanitizeLatexExpression(latex);
      return `\n\n$$${sanitized}$$\n\n`;
    });

    // Handle inline math
    text = text.replace(/\$(.*?)\$/g, (_, latex) => {
      const sanitized = this.sanitizeLatexExpression(latex);
      return `$${sanitized}$`;
    });

    // Handle escaped delimiters
    text = text.replace(/\\\$/g, '\\\\$');

    // Process the markdown with KaTeX
    const rendered = this.md.render(text);

    // Wrap in container for proper styling
    return `<div class="markdown-content">${rendered}</div>`;
  }

  @ViewChild('codeSnippetContainer', { static: false }) 
  codeSnippetContainer: ElementRef<HTMLDivElement> | undefined; 

  isCodeSnippetReady = false; // Flag to indicate if code is ready for highlighting
  @ViewChild('pageTitle') pageTitle!: ElementRef;
  @ViewChild('pageSubtitle') pageSubtitle!: ElementRef;
  userInput = '';
  messages: Message[] = [];
  client: any;
  isSidebarOpen = false;
  model = 'llama3.1-70b';
  systemPrompt = '';
  sessions: { 
    name: string; 
    messages: Message[]; 
    fileContext?: { name: string; type: string; content: string };
    generatedImages?: string[]; // Store generated images per session
  }[] = [];
  currentSessionIndex = -1;  // Instead of 0
  currentSessionName = '';
  newSessionName = '';
  @ViewChild(IonContent) content!: IonContent;
  @ViewChild('fileInput') fileInput!: ElementRef;
  presentingElement: any;
  isStreaming = false;
  isMultimodalEnabled = false;
  isWebGroundingEnabled = false;
  selectedImage: string | null = null;
  selectedFile: File | null = null;
  showTemplatesPage = true;
  abortController: AbortController | null = null;
  isStreamStopped = false;
  isMagicDoneButtonVisible = false;
  isImageGenEnabled = false; // Add this property
  isSidebarHovered = false; 
  isSidebarManuallyOpened = false; // Track if sidebar is manually opened

  isAssistantMessageOptionsOpen = false;
  selectedAssistantMessageIndex: number | undefined = undefined;

  isEditingMessage = false;
  editMessageInput = ' ';
  isCopied: boolean = false;
  isRightSidebarOpen = false;
  selectedCodeSnippet: string | null = null;

  // Add these properties
  editingSessionIndex: number | null = null;
  editedSessionName: string = '';

  isLearning = false;
  learnedUserInfo = '';
  
  templateSuggestions: Template[] = [];

  isUserMessageOptionsOpen = false;  // Add this
  userActionSheetButtons: ActionSheetButton[] = []; // Add this
  
  // Add categories array
  categories = [
    { id: 'all', name: 'All', icon: 'grid-outline' },
    { id: 'creative', name: 'Creative', icon: 'pencil-outline' },
    { id: 'development', name: 'Development', icon: 'code-slash-outline' },
    { id: 'academic', name: 'Academic', icon: 'school-outline' },
    { id: 'business', name: 'Business', icon: 'briefcase-outline' },
    { id: 'language', name: 'Language', icon: 'language-outline' }
  ];

  selectedCategory = 'all';

  // Update your template data with categories
  templateConversations = [
    {
      name: 'Creative Writing',
      prompt: 'Write a short story about a magical library.',
      description: 'Get help with creative writing including stories, poems, and scripts.',
      category: 'creative',
      tags: ['creative', 'story']
    },
    {
      name: 'Character Development',
      prompt: 'Help me develop a complex character for my novel.',
      description: 'Explore methods for building characters with depth and backstory.',
      category: 'creative',
      tags: ['character','story']
    },
    {
      name: 'Programming / Coding',
      prompt: 'Help me write a function to reverse a string in Python.',
      description: 'Get assistance with coding problems across different programming languages.',
      category: 'development',
      tags: ['coding', 'programming', 'technical']
    },
    {
      name: 'Web Development',
      prompt: 'How do I create a responsive navbar in HTML and CSS?',
      description: 'Learn about front-end development for creating websites and web apps.',
      category: 'development',
      tags: ['HTML', 'CSS', 'responsive design']
    },
    {
      name: 'Physics',
      prompt: 'Explain how gravity works in simple terms.',
      description: 'Learn about physics concepts with clear explanations and examples.',
      category: 'academic'
    },
    {
      name: 'Quantum Mechanics',
      prompt: 'What is quantum entanglement?',
      description: 'Explore advanced physics concepts with simplified explanations.',
      category: 'academic'
    },
    {
      name: 'Chemistry',
      prompt: 'What happens when you mix baking soda and vinegar?',
      description: 'Understand chemical reactions and molecular structures simply.',
      category: 'academic'
    },
    {
      name: 'Organic Chemistry',
      prompt: 'Explain the basic structure of a carbon ring.',
      description: 'Dive into organic chemistry structures and their reactions.',
      category: 'academic'
    },
    {
      name: 'History',
      prompt: 'What were the main causes of World War II?',
      description: 'Explore historical events and their impact on our world.',
      category: 'academic'
    },
    {
      name: 'Ancient Civilizations',
      prompt: 'What were the major achievements of the Egyptians?',
      description: 'Discover the cultures and innovations of ancient civilizations.',
      category: 'academic'
    },
    {
      name: 'Math / Problem Solving',
      prompt: 'Help me solve this equation: 2x + 5 = 13',
      description: 'Get step-by-step help with math problems at any level.',
      category: 'academic'
    },
    {
      name: 'Statistics',
      prompt: 'How do I calculate the standard deviation of a dataset?',
      description: 'Learn the fundamentals of data statistics and probability.',
      category: 'academic'
    },
    {
      name: 'Business',
      prompt: 'How do I write a simple business plan?',
      description: 'Learn about business planning, strategy, and analysis.',
      category: 'business'
    },
    {
      name: 'Marketing',
      prompt: 'What are some effective strategies for social media marketing?',
      description: 'Get insights into marketing strategies and techniques.',
      category: 'business'
    },
    {
      name: 'Language',
      prompt: 'Teach me 5 basic Punjabi greetings.',
      description: 'Practice new languages and learn essential phrases.',
      category: 'language'
    },
    {
      name: 'Language (French)',
      prompt: 'How do you introduce yourself in French?',
      description: 'Learn common phrases and basics of the French language.',
      category: 'language'
    },
    {
      name: 'Environmental Science',
      prompt: 'What are 3 things I can do to help the environment?',
      description: 'Learn about environmental issues and sustainability.',
      category: 'academic'
    },
    {
      name: 'Climate Change',
      prompt: 'How does carbon dioxide contribute to climate change?',
      description: 'Understand the science behind climate change and its effects.',
      category: 'academic'
    },
    {
      name: 'Data Analysis',
      prompt: 'How do I calculate the average of these numbers: 4, 8, 15, 16, 23, 42?',
      description: 'Get help analyzing and understanding data.',
      category: 'academic'
    },
    {
      name: 'Machine Learning',
      prompt: 'What is supervised learning in machine learning?',
      description: 'Learn about machine learning concepts and techniques.',
      category: 'academic'
    },
    {
      name: 'Music',
      prompt: 'Explain what makes a major scale different from a minor scale.',
      description: 'Learn music fundamentals, theory, and composition basics.',
      category: 'creative'
    },
    {
      name: 'Music Composition',
      prompt: 'How do I write a simple melody?',
      description: 'Get help with creating melodies and harmonies in music composition.',
      category: 'academic'
    },
    {
      name: 'Art & Drawing',
      prompt: 'How do I draw a human face with basic proportions?',
      description: 'Learn foundational drawing techniques and tips for art.',
      category: 'creative'
    },
    {
      name: 'Painting Techniques',
      prompt: 'What are some beginner watercolor techniques?',
      description: 'Discover techniques for various painting mediums.',
      category: 'creative'
    }
  ];
  
  
  filteredTemplates: Template[] = [...this.templateConversations];
  
  // Add these properties to your class
  isTemplateToggleEnabled = true;  // Default state
  isMobile = false;  // To track device type

  @ViewChild(IonInfiniteScroll) infiniteScroll!: IonInfiniteScroll;
  
  // Add these properties
  pageSize = 15; // Number of messages to load at once
  currentPage = 0;
  visibleMessages: Message[] = [];
  isLoadingMore = false;
  
  // Add new minimal mode properties
  minimalSuggestions = [
    { icon: 'code-outline', text: 'Code in rust' },
    { icon: 'book-outline', text: 'Explain gravity' },
    { icon: 'create-outline', text: 'Write a short story' },
    { icon: 'school-outline', text: 'What is a LLM' },
    { icon: 'briefcase-outline', text: 'Business plan template' },
    { icon: 'language-outline', text: 'Basic Punjabi phrases' }
  ];

  constructor(
    private router: Router,
    private storage: Storage,
    private modalCtrl: ModalController,
    private platform: Platform,
    private loadingController: LoadingController,
    private toastController: ToastController,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
    private settingsService: SettingsService,
    private webGroundingService: WebGroundingService,
    private renderer: Renderer2

    
  ) {
    // Add platform detection
    this.isMobile = this.platform.is('mobile');
    // Keep templates page visible but disable template toggle on mobile
    this.showTemplatesPage = true;
    this.isTemplateToggleEnabled = !this.isMobile;
  }

  

  @ViewChild('messageInput') messageInput!: ElementRef;

  handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      if (event.shiftKey || this.platform.is('mobile')) {
        // Allow new line when Shift is pressed or on mobile
        return; // Let the default behavior handle the new line
      } else {
        // Send message only when Enter is pressed without Shift
        event.preventDefault();
        this.sendMessage();
      }
    }
  }

  async handlePaste(event: ClipboardEvent, inputType: string) {
    if (!this.isImageGenEnabled) return;
  
    const items = event.clipboardData?.items;
    if (!items) return;
  
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          try {
            // Validate file size (e.g., max 5MB)
            const MAX_SIZE = 5 * 1024 * 1024; // 5MB
            if (file.size > MAX_SIZE) {
              await this.showErrorToast('Image size too large. Maximum size is 5MB.');
              return;
            }
  
            // Validate file type
            const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
            if (!allowedTypes.includes(file.type)) {
              await this.showErrorToast('Invalid image type. Please use JPG, PNG or GIF.');
              return;
            }
  
            // Process the image
            const compressedImage = await this.compressImage(file);
            if (inputType === 'user') {
              this.selectedImage = compressedImage;
              this.selectedFile = file;
            }
          } catch (error) {
            console.error('Error processing pasted image:', error);
            await this.showErrorToast('Failed to process pasted image');
          }
        }
      }
    }
  }
  
  
  // Add a new method to compress images
  private async compressImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
  
          // Max dimensions
          const MAX_WIDTH = 1024;
          const MAX_HEIGHT = 1024;
  
          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round((height * MAX_WIDTH) / width);
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round((width * MAX_HEIGHT) / height);
              height = MAX_HEIGHT;
            }
          }
  
          canvas.width = width;
          canvas.height = height;
  
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }
  
          ctx.drawImage(img, 0, 0, width, height);
  
          // Convert to JPEG with reduced quality
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve(compressedDataUrl);
        };
  
        img.onerror = () => {
          reject(new Error('Failed to load image'));
        };
  
        img.src = e.target?.result as string;
      };
  
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
  
      reader.readAsDataURL(file);
    });
  }
  

  async ngOnInit() {
    
    hljs.registerLanguage('javascript', javascript);
    hljs.registerLanguage('python', python);
    hljs.registerLanguage('xml', xml);
    hljs.registerLanguage('css', css);
    hljs.registerLanguage('json', json); 
    await this.storage.create();
    this.isImageGenEnabled = 
    (await this.storage.get('isImageGenEnabled')) || false;
    this.isLearning = (await this.storage.get('isLearning')) || false;
    this.learnedUserInfo = (await this.storage.get('learnedUserInfo')) || '';

    const storedModel = await this.storage.get('model');
    const storedSystemPrompt = await this.storage.get('systemPrompt');
    const storedSessions = await this.storage.get('sessions');
    this.isMultimodalEnabled =
      (await this.storage.get('isMultimodalEnabled')) || false;
    this.isWebGroundingEnabled =
      (await this.storage.get('isWebGroundingEnabled')) || false;

    if (storedModel) {
      this.model = storedModel;
    }

    if (storedSystemPrompt) {
      this.systemPrompt = storedSystemPrompt;
    }

    if (storedSessions) {
      this.sessions = storedSessions;
      // Only set currentSessionIndex if we're not on templates page
      this.currentSessionIndex = this.showTemplatesPage ? -1 : 0;
    }

    this.presentingElement = document.querySelector('.ion-page');

    if (this.platform.is('android')) {
      StatusBar.setStyle({ style: Style.Dark });
      StatusBar.setBackgroundColor({ color: '#181818' });
    }

    const storedApiKey = await this.storage.get('apiKey');
    const storedBaseUrl = await this.storage.get('baseUrl');

    if (storedApiKey && storedBaseUrl) {
      this.initializesdk(storedApiKey, storedBaseUrl);
    } else {
      console.warn('API Key or base URL not found in storage. Initializing with default values.');
      await this.initializeOpenAIClient();
    }

    const hasShownFirstTimeMessage = await this.storage.get('hasShownFirstTimeMessage');
    if (!hasShownFirstTimeMessage) {
      await this.showFirstTimeToast();
      await this.storage.set('hasShownFirstTimeMessage', true);
    }


    const isLightMode = await this.storage.get('isLightMode');
    this.applyTheme(isLightMode === true ? 'light' : 'dark');

    this.templateSuggestions = [...this.templateConversations];
    await this.saveSettings();

    // Load saved template toggle preference only for desktop
    if (!this.isMobile) {
      const savedToggle = await this.storage.get('templateToggleEnabled');
      this.isTemplateToggleEnabled = savedToggle !== null ? savedToggle : true;
    }

    // Don't automatically hide templates page on mobile
    // Instead, let users navigate away when they start a chat or click quick chat
    if (storedSessions) {
      this.sessions = storedSessions;
      this.currentSessionIndex = this.showTemplatesPage ? -1 : 0;
    }

    // Cache DOM elements
    this.heroSection = document.querySelector('.hero-section');
    
    // Add intersection observer for lazy loading
    if ('IntersectionObserver' in window) {
      const lazyLoadObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const lazyElement = entry.target as HTMLElement;
            lazyElement.classList.add('visible');
            lazyLoadObserver.unobserve(lazyElement);
          }
        });
      });

      document.querySelectorAll('.template-card').forEach(card => {
        lazyLoadObserver.observe(card);
      });
    }

    this.resetVirtualScroll();

  }

  async saveSettings() {
    try {
      const storedVersion = await this.storage.get('systemPromptVersion') || 0;
      console.log('Stored system prompt version:', storedVersion);
      if (storedVersion !== this.currentSystemPromptVersion) {
        // Define new system prompt based on version
        let newSystemPrompt = '';
        
        switch (this.currentSystemPromptVersion) {
          case 1:
            newSystemPrompt = 'You are a helpful assistant named Gaurika, Made by Gaurish Mehra.. You are much more than a simple llm, the default model is llama3.1-70b, but the user may change it.';
            break;
          case 7:
            newSystemPrompt = "You are a helpful Knowledge Aid that is named Gaurika (Gaurika stands for Gaurish's Advanced Universal Reasoning Interactive Knowledge Aid), Made by Gaurish Mehra (Age 16, Lives in India).. You are much more than a simple llm, but if the user is advanced enough they may change it, right now you are running the " + this.model + ' model, Try to use codeblocks i.e ```text goes here``` as much as possible, to get better formatted responses.';
            break;
          // Add more cases as needed
        }
  
        // Update system prompt and version in storage
        await this.storage.set('systemPrompt', newSystemPrompt);
        await this.storage.set('systemPromptVersion', this.currentSystemPromptVersion);
        this.systemPrompt = newSystemPrompt;
        
        // Show update notification
        const toast = await this.toastController.create({
          message: 'System prompt has been updated',
          duration: 3000,
          position: 'bottom',
          color: 'success'
        });
        toast.present();
        window.location.reload();
      }
      else{
        console.log('System prompt is up to date');
      }

    } catch (error) {
      console.error('Error saving settings:', error);
      await this.showErrorToast('Failed to save settings');
    }
  }


  applyTheme(theme: 'light' | 'dark') {
    document.body.classList.toggle('light-mode', theme === 'light');
    document.body.classList.toggle('dark-mode', theme === 'dark');
  }
  async showFilePreview(fileContent: string) {
    const truncatedContent = fileContent.split(/\s+/).slice(0, 1024).join(' '); // Get first 1024 words

    const actionSheet = await this.actionSheetController.create({
      header: 'File Preview',
      subHeader: truncatedContent + '...', // Display truncated content
      buttons: [
        {
          text: 'Exit',
          role: 'cancel',
          icon: 'close',
          handler: () => {
            // Action sheet will automatically close
          }
        }
      ]
    });
    await actionSheet.present();
  }
  getDisplayContent(content: string): string {
    if (this.hasFileContext(content)) {
      return content.split('\n\n')[0]; // Return only the user's message
    }
    return content;
  }

  hasFileContext(content: string): boolean {
    return content.includes('File Context - Title:');
  }

  // renderMarkdown(text: string): string {
  //   // Pre-process math blocks
  //   text = text.replace(/\$\$(.*?)\$\$/gs, (_, latex) => {
  //     const sanitized = this.sanitizeLatexExpression(latex);
  //     return `$$${sanitized}$$`;
  //   });

  //   text = text.replace(/\$(.*?)\$/g, (_, latex) => {
  //     const sanitized = this.sanitizeLatexExpression(latex);
  //     return `$${sanitized}$`;
  //   });

  //   return this.md.render(text);
  // }

  async showUserMessageOptions(message: Message, index: number) { // Add this method
    // Only allow editing the latest user message
    const isLatestUserMessage = this.isLatestUserMessage(index);
    
    this.isUserMessageOptionsOpen = true;
    this.userActionSheetButtons = [
      {
        text: 'Edit Message',
        icon: 'create',
        handler: () => {
          if (isLatestUserMessage) {
            this.startEditUserMessage(index);
          } else {
            this.showErrorToast('You can only edit the latest message.');
          }
        }
      },
      {
        text: 'Copy Message',
        icon: 'copy',
        handler: async () => {
          if (message.content) {
            try {
              await Clipboard.write({
                string: message.content
              });
              const toast = await this.toastController.create({
                message: 'Message copied to clipboard',
                duration: 2000,
                position: 'top',
                color: 'success'
              });
              toast.present();
            } catch (error) {
              console.error('Failed to copy message:', error);
              const toast = await this.toastController.create({
                message: 'Failed to copy message',
                duration: 2000,
                position: 'top',
                color: 'danger'
              });
              toast.present();
            }
          }
        }
      },
      {
        text: 'Delete',
        role: 'destructive',
        icon: 'trash',
        handler: () => this.deleteMessage(index)
      },
      {
        text: 'Cancel',
        role: 'cancel',
        icon: 'close'
      }
    ];
    
    this.isUserMessageOptionsOpen = true;
  }

  isLatestUserMessage(index: number): boolean {
    for (let i = index + 1; i < this.messages.length; i++) {
      if (this.messages[i].role === 'user') {
        return false;
      }
    }
    return true;
  }

  startEditUserMessage(index: number) {
    if (!this.isLatestUserMessage(index)) {
      this.showErrorToast('You can only edit the latest message');
      return;
    }
  
    this.editingUserMessageIndex = index;
    this.editingUserMessageContent = this.messages[index].content;
    // Clear any existing input
    this.userInput = '';
    
    // Fix: Safely handle image and file assignments
    const message = this.messages[index];
    
    // Handle image
    if (message && message.image !== undefined) {
      this.selectedImage = message.image;
    }
  
    // Handle file
    if (message && message.file) {
      try {
        this.selectedFile = new File([''], message.file.name, { 
          type: message.file.type 
        });
      } catch (error) {
        console.error('Error creating file:', error);
        this.selectedFile = null;
      }
    }
  }
  
  removeAttachmentDuringEdit() {
    if (this.editingUserMessageIndex !== null && this.editingUserMessageIndex >= 0) {
      const message = this.messages[this.editingUserMessageIndex];
      if (message) {
        // Safely handle image removal
        if ('image' in message) {
          message.image = null;
          this.selectedImage = null;
        }
  
        // Safely handle file removal
        if ('file' in message) {
          message.file = undefined; // Use undefined instead of null to match the type
          this.selectedFile = null;
        }
      }
    }
  }
  

  async saveUserMessageEdit(index: number) {
    // Validate that there's content to send
    if (this.editingUserMessageContent.trim() === '') {
      await this.showErrorToast('Message cannot be empty');
      return;
    }
  
    // Update the message content
    this.messages[index] = {
      ...this.messages[index],
      content: this.editingUserMessageContent,
      image: this.selectedImage,
      file: this.selectedFile ? {
        name: this.selectedFile.name,
        type: this.selectedFile.type,
        content: await this.readFileAsText(this.selectedFile)
      } : undefined
    };
  
    // Remove all subsequent messages (assistant responses)
    this.messages = this.messages.slice(0, index + 1);
  
    // Reset editing state
    this.editingUserMessageIndex = null;
    this.editingUserMessageContent = '';
  
    // Clear the global attachment states
    this.selectedImage = null;
    this.selectedFile = null;
  
    // Trigger new assistant response
    this.isStreaming = true;
    await this.sendMessage(true);
  }
  

  cancelUserMessageEdit() {
    this.editingUserMessageIndex = null;
    this.editingUserMessageContent = '';
    // Make sure to clear any attachments
    this.selectedImage = null;
    this.selectedFile = null;
    // Clear the input as well
    this.userInput = '';
  }


  async showFileContext(content: string) {
    const fileContextPart = content.split('\n\n')[1]; // Get the file context part
    const [titlePart, contentPart] = fileContextPart.split('\nContent: ');
    const title = titlePart.replace('File Context - Title: ', '');

    const actionSheet = await this.actionSheetController.create({
      header: 'File Context',
      subHeader: title,
      buttons: [
        {
          text: 'View Content',
          icon: 'document-text-outline',
          handler: () => {
            this.showFilePreview(contentPart);
          }
        },
        {
          text: 'Cancel',
          icon: 'close',
          role: 'cancel'
        }
      ]
    });
    await actionSheet.present();
  }

  extractFileNameFromContent(content: string): string {
    if (this.hasFileContext(content)) {
      const fileContextPart = content.split('\n\n')[1]; 
      const titlePart = fileContextPart.split('\nContent: ')[0];
      return titlePart.replace('File Context - Title: ', '');
    }
    return '';
  }
  centerTextElements() {
    const titleWidth = this.pageTitle.nativeElement.offsetWidth;
    const subtitleWidth = this.pageSubtitle.nativeElement.offsetWidth;

    this.pageTitle.nativeElement.style.width = `${titleWidth}em`;
    this.pageSubtitle.nativeElement.style.width = `${subtitleWidth}em`;
  }

  async showFirstTimeToast() {
    this.settingsService.saveDefaultSettings();
    console.log('First time toast');
  }

  async initializeOpenAIClient() {
    const storedApiKey = await this.storage.get('apiKey');
    const storedBaseUrl = await this.storage.get('baseUrl');

    if (storedApiKey && storedBaseUrl) {
      this.initializesdk(storedApiKey, storedBaseUrl);
    } else {
      console.warn('No API key or base URL selected. Please configure in settings.');
      this.showErrorToast('No API key or base URL selected. Please configure in settings.');
    }
  }

  initializesdk(apiKey: string, baseUrl?: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl || '',
      dangerouslyAllowBrowser: true,
    });
  }

  async onFileSelected(event: Event) {
    this.selectedFile = (event.target as HTMLInputElement).files?.[0] || null;

    if (this.selectedFile) {
      if (this.isMultimodalEnabled && this.selectedFile.type.startsWith('image/')) {
        this.selectedImage = await this.readFileAsDataURL(this.selectedFile);
      } else if (!this.isMultimodalEnabled && this.selectedFile.type.startsWith('image/')) {
        this.showErrorToast('Image uploads are only allowed with multimodal models. Please enable multimodal mode in settings.');
        this.selectedFile = null;
      } else {

        this.selectedImage = null;
      }
    }
  }

  private async readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }




  async readFileAsText(file: File): Promise<string> {
    // Define text-based MIME types (including PDF)
    const textBasedTypes = [
      'text/plain', 'text/html', 'text/css', 'text/javascript',
      'application/json', 'application/xml', 'application/javascript',
      'application/typescript', 'text/markdown', 'text/csv',
      'application/pdf'
    ];

    // Check if file is a text-based type
    const isTextBased = textBasedTypes.some(type => file.type.startsWith(type)) ||
      file.name.match(/\.(txt|js|json|css|html|xml|md|csv|ts|pdf)$/i);

    if (!isTextBased) {
      return `[This file type (${file.type || 'unknown'}) cannot be displayed as text. File name: ${file.name}]`;
    }

    // Handle PDF files
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map((item: any) => item.str).join(' ') + '\n';
        }
        return text;
      } catch (error) {
        console.error('Error reading PDF:', error);
        return `[Error reading PDF file: ${file.name}]`;
      }
    }

    // Handle other text-based files
    try {
      const text = await file.text();
      // Basic check for binary content
      if (/[\x00-\x08\x0E-\x1F\x7F-\xFF]/.test(text.substring(0, 1000))) {
        return `[This file appears to contain binary data and cannot be displayed as text. File name: ${file.name}]`;
      }
      return text;
    } catch (error) {
      console.error('Error reading file:', error);
      return `[Error reading file: ${file.name}]`;
    }
  }


  removeSelectedImage() {
    this.selectedImage = null;
    this.selectedFile = null;
  }

  async getBase64Image(imgUrl: string): Promise<string> {
    if (imgUrl.startsWith('data:image')) {
      return imgUrl;
    }

    try {
      const response = await fetch(imgUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error getting base64 image:', error);
      await this.showErrorToast('Error loading image.');
      return '';
    }
  }

  getFileIcon(fileType: string): string | null { 
    switch (fileType) {
      case 'application/pdf':
        return 'document-outline';
      case 'application/vnd.ms-excel':
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        return 'document-text-outline';
      case 'text/csv':
        return 'reorder-four-outline';
      case 'application/json':
        return 'code-slash-outline';
      default:
        return null; // Return null for unknown types
    }
  }


  openSettings() {
    this.router.navigate(['/settings']);
  }
  gotoappmenu(){
    this.router.navigate(['/app']);
  }
  showTemplates() {
    this.showTemplatesPage = true;
    // Reset current session when showing templates
    this.currentSessionIndex = -1;
    this.currentSessionName = '';
    this.toggleSidebar();
    if (this.showTemplatesPage) {
      this.centerTextElements();
    }
  }

  onUserInput() {
    if (this.showTemplatesPage && this.userInput.trim() !== '') {
      this.showTemplatesPage = false;
    }
  }
  
  @HostListener('document:mousemove', ['$event']) 
  onMouseMove(event: MouseEvent) {
    if (window.innerWidth > 768) { // Only apply hover effect on desktop
      const sidebarWidth = 300; // Adjust if your sidebar width is different
      this.isSidebarHovered = event.clientX <= sidebarWidth;

      // Open sidebar on hover only if not manually opened
      if (!this.isSidebarManuallyOpened) {
        this.isSidebarOpen = this.isSidebarHovered; 
      }
    }
  }

  toggleSidebar() {
    this.isSidebarOpen = !this.isSidebarOpen;
    this.isSidebarManuallyOpened = this.isSidebarOpen; // Update manual open status
  }

  extractCodeFromLine(line: string): string {
    const codeStartIndex = line.indexOf('```');
    if (codeStartIndex > -1) {
      return line.substring(codeStartIndex + 3).trim(); 
    }
    return '';
  }

  splitMessageContent(content: string): MessagePart[] {
    const parts: MessagePart[] = [];
    let currentPart: MessagePart = { type: 'text', content: '', startIndex: 0 };
    let isInCodeBlock = false;
    let lineNumber = 0;

    content.split('\n').forEach(line => {
      if (line.trim().startsWith('```')) {
        if (!isInCodeBlock) {
          // Start of code block - get language
          parts.push(currentPart);
          const language = line.trim().slice(3).toLowerCase();
          currentPart = { 
            type: 'code', 
            content: '', 
            language: language || 'Text',
            startIndex: lineNumber 
          };
          isInCodeBlock = true;
        } else {
          // End of code block
          parts.push(currentPart);
          currentPart = { type: 'text', content: '', startIndex: lineNumber + 1 };
          isInCodeBlock = false;
        }
      } else {
        currentPart.content += line + '\n';
      }
      lineNumber++;
    });

    parts.push(currentPart);
    return parts.filter(part => part.content.trim());
  }

  trimCodeBlock(code: string): string {
    return code.split('\n').map(line => line.trim()).join('\n'); 
  }

  async createNewSessionFromMessage(message: string) {
    // Create a new session with a default name
    const defaultSessionName = 'New Chat';
    
    // Create new session object
    const newSession = {
      name: defaultSessionName,
      messages: [],
      generatedImages: []
    };
    
    // Add the new session and set it as current
    this.sessions.push(newSession);
    this.currentSessionIndex = this.sessions.length - 1;
    this.currentSessionName = defaultSessionName;
    
    // Initialize the messages array for this session
    this.messages = [];
    
    this.showTemplatesPage = false;
  
    // Save initial empty session
    this.saveCurrentSession();
  
    // Set the userInput to the passed message
    this.userInput = message;
  
    // Send the message
    await this.sendMessage();
  
    // Rest of the existing code for naming the session...
    try {
      // First, try to generate a name using the API
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system', 
            content: 'You must respond ONLY with a 1-3 word title. No explanations, no quotes, no additional text. If context is unclear or missing, still provide a generic topic-based title. Never apologize or explain - just output 1-3 relevant words as a title. No punctuation allowed except spaces between words.'
          },
          {
            role: 'user',
            content: message // Use the passed message here
          },
        ],
        max_tokens: 5
      });
      let sessionName = response.choices[0].message.content?.trim();
  
      if (!sessionName) {
        throw new Error('Empty response from API');
      }
  
      if (sessionName.length > 20) {
        sessionName = sessionName.substring(0, 20) + '...';
      }
  
      // Update the session name
      this.sessions[this.currentSessionIndex].name = sessionName;
      this.currentSessionName = sessionName;
    } catch (error) {
      console.error('Error generating session name:', error);
      
      // Fallback: Use the first few words of the user's message as the session name
      let fallbackName = message.split(' ').slice(0, 3).join(' ');
      if (fallbackName.length > 20) {
        fallbackName = fallbackName.substring(0, 20) + '...';
      }
      
      this.sessions[this.currentSessionIndex].name = fallbackName;
      this.currentSessionName = fallbackName;
      
      // Optionally, show a toast to inform the user
      await this.showErrorToast('Could not generate a custom name for this chat.');
    } finally {
      // Save the updated session
      this.saveCurrentSession();
    }
  }

  confirmNewSession() {
    if (this.newSessionName.trim()) {
      this.sessions.push({ 
        name: this.newSessionName, 
        messages: [],
        generatedImages: [] // Initialize generatedImages for the new session
      });
      this.currentSessionIndex = this.sessions.length - 1;
      this.loadCurrentSession();
      this.newSessionName = '';
      this.saveCurrentSession();
    }
  }

  async loadCurrentSession() {
    // Existing code...
    this.showTemplatesPage = false;
    // Save the current template toggle state when entering a chat
    const currentToggleState = await this.storage.get('templateToggleEnabled');
    this.isTemplateToggleEnabled = currentToggleState !== null ? currentToggleState : true;
    // Rest of existing loadCurrentSession code...
    if (this.currentSessionIndex >= 0 && this.currentSessionIndex < this.sessions.length) {
      this.messages = this.sessions[this.currentSessionIndex].messages;
      this.currentSessionName = this.sessions[this.currentSessionIndex].name;

      // Refresh system prompt from storage
      this.systemPrompt = await this.storage.get('systemPrompt') || ''; // Get updated prompt
    } else {
      this.messages = [];
      this.currentSessionName = '';
    }
    setTimeout(() => {
      this.content.scrollToBottom(300);
    });
  }

  saveCurrentSession() {
    this.sessions[this.currentSessionIndex].messages = this.messages;
    this.storage.set('sessions', this.sessions);
  }

  switchSession(index: number, event?: Event) {
    if (this.editingSessionIndex !== null) {
      return;
    }

    if (!this.isMultimodalEnabled && this.sessions[index].messages.some(m => m.image)) {
      this.showErrorToast('This session contains images and cannot be accessed with the current model. Please enable multimodal mode in settings.');
      return;
    }

    this.currentSessionIndex = index;
    this.loadCurrentSession();  // This will now refresh the prompt
    this.toggleSidebar();
  }


  deleteSession(index: number) {
    if (this.sessions.length > 1) {
      this.sessions.splice(index, 1);
      if (this.currentSessionIndex >= this.sessions.length) {
        this.currentSessionIndex = this.sessions.length - 1;
      }
      this.loadCurrentSession();
      this.saveCurrentSession();
    } else {
      this.showErrorToast('You must have at least one chat.');
    }
  }

  getFilteredMessages(): Message[] {
    return this.visibleMessages.filter((m) => m.role !== 'tool');
  }

  isToolCallInProgress(): boolean {
    return this.messages.some((m) => m.isToolCallInProgress);
  }

  getToolCallInProgressMessage(): string {
    return this.messages.find((m) => m.isToolCallInProgress)?.content || '';
  }

  deleteMessage(index: number) {
    if (index >= 0 && index < this.messages.length) {
      this.messages.splice(index, 1);
      this.saveCurrentSession();
    }
    this.activeMessageActions = null;
  }

  get lastAssistantMessage(): Message | undefined {
    let lastMessage: Message | undefined;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === "assistant") {
        lastMessage = this.messages[i];
        break;
      }
    }
    return lastMessage;
  }

  retryLastAssistantMessage() {
    if (this.lastAssistantMessage) {
      const lastAssistantMessageIndex = this.messages.lastIndexOf(this.lastAssistantMessage);

      if (lastAssistantMessageIndex !== -1) {
        const lastUserMessageIndex = lastAssistantMessageIndex - 1;

        if (lastUserMessageIndex >= 0 && this.messages[lastUserMessageIndex].role === 'user') {
          const lastUserMessageContent = this.messages[lastUserMessageIndex].content;
          const lastUserMessageImage = this.messages[lastUserMessageIndex].image;
          const lastUserMessageFile = this.messages[lastUserMessageIndex].file;

          this.messages.splice(lastUserMessageIndex, 2);

          this.userInput = lastUserMessageContent;
          this.selectedImage = lastUserMessageImage || null;
          this.selectedFile = lastUserMessageFile ? new File([""], lastUserMessageFile.name, { type: lastUserMessageFile.type }) : null;

          this.sendMessage();
        }
      }
    }
  }

  async startConversation(template: Template) {
    // Create new session
    const newSession = {
      name: template.name,
      messages: [],
      generatedImages: []
    };
  
    // Add the new session and set it as current
    this.sessions.push(newSession);
    this.currentSessionIndex = this.sessions.length - 1;
    this.currentSessionName = template.name;
    
    // Initialize the messages array for this session
    this.messages = [];
    
    // Set the user input and send message
    this.userInput = template.prompt;
    await this.sendMessage();
    
    // Save the session after message is sent
    this.saveCurrentSession();
    
    // Only hide templates after conversation starts
    this.showTemplatesPage = false;
  }

  getIconForTemplate(templateName: string): string {
    switch (templateName) {
      case 'Creative Writing':
        return 'pencil-outline';
      case 'Character Development':
        return 'person-outline';
      case 'Programming / Coding':
        return 'code-slash-outline';
      case 'Web Development':
        return 'globe-outline';
      case 'Physics':
        return 'planet-outline';
      case 'Quantum Mechanics':
        return 'nuclear-outline';
      case 'Chemistry':
        return 'flask-outline';
      case 'Organic Chemistry':
        return 'beaker-outline';
      case 'History':
        return 'book-outline';
      case 'Ancient Civilizations':
        return 'school-outline';
      case 'Math / Problem Solving':
        return 'calculator-outline';
      case 'Statistics':
        return 'stats-chart-outline';
      case 'Business':
        return 'briefcase-outline';
      case 'Marketing':
        return 'megaphone-outline';
      case 'Language':
        return 'language-outline';
      case 'Language (French)':
        return 'language-outline';
      case 'Environmental Science':
        return 'leaf-outline';
      case 'Climate Change':
        return 'thermometer-outline';
      case 'Data Analysis':
        return 'bar-chart-outline';
      case 'Machine Learning':
        return 'hardware-chip-outline';
      case 'Music':
        return 'musical-notes-outline';
      case 'Music Composition':
        return 'musical-notes-outline';
      case 'Art & Drawing':
        return 'color-palette-outline';
      case 'Painting Techniques':
        return 'brush-outline';
      default:
        return 'chatbubbles-outline';
    }
  }
  

  async sendMessage(isRedo: boolean = false) {
    if (!this.client) {
      await this.initializeOpenAIClient();
      if (!this.client) {
        await this.showErrorToast('API client not initialized. Please check your API key settings.');
        return;
      }
    }

    const messageContent = this.userInput.trim();
    if (!isRedo && messageContent === '' && !this.selectedFile && !this.selectedImage) return;

    // If starting a new conversation (no current session) or from templates, create a new session
    if (this.currentSessionIndex === -1 || this.showTemplatesPage || this.sessions.length === 0) {
      await this.createNewSessionFromMessage(messageContent);
      return; // The message has already been sent in createNewSessionFromMessage
    }

    this.isStreaming = true;
    this.isStreamStopped = false;

    // Handle file content first
    let fileContextMessage = '';
    if (this.selectedFile && !this.selectedFile.type.startsWith('image/')) {
      const fileContent = await this.readFileAsText(this.selectedFile);
      this.sessions[this.currentSessionIndex].fileContext = {
        name: this.selectedFile.name,
        type: this.selectedFile.type,
        content: fileContent
      };
      fileContextMessage = `\n\nFile Context - Title: ${this.selectedFile.name}\nContent: ${fileContent}`;
    }

    // Prepare tools array based on enabled features
    const tools: Tool[] = [];
    if (this.isWebGroundingEnabled) {
      tools.push({
        type: 'function',
        function: {
          name: 'webgroundtool',
          description: "Use this tool to search the web for factual information related to the user's request.",
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'query to search the web' },
            },
            required: ['query'],
          },
        },
      });
    }

    if (this.isImageGenEnabled) {
      tools.push({
        type: 'function',
        function: {
          name: 'imagetool',
          description: "Use this tool to generate an image based on the user's description.",
          parameters: {
            type: 'object',
            properties: {
              description: { type: 'string', description: 'Description of the image to generate' },
            },
            required: ['description'],
          },
        },
      });
    }

    if (this.isLearning) {
      tools.push({
        type: 'function',
        function: {
          name: 'learningtool',
          description: 'Use this tool to save or remove important information about the user for personalized interactions',
          parameters: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['add', 'remove'],
                description: 'Whether to "add" new information or "remove" existing information',
              },
              information: {
                type: 'string',
                description: 'The information to add or remove about the user',
              },
            },
            required: ['action', 'information'],
          },
        },
      });
    }

    // Create the message object with timestamp for local display
    let newMessage: Message = {
      role: 'user',
      content: messageContent + fileContextMessage,
      timestamp: new Date(),
    };

    // Add image if multimodal is enabled and image is selected
    if (this.isMultimodalEnabled && this.selectedImage) {
      newMessage.image = this.selectedImage;
    }

    // Only add a new user message if it's not a redo
    if (!isRedo) {
      this.messages.push({
        role: 'user',
        content: messageContent,
        image: this.selectedImage,
        file: this.selectedFile ? {
          name: this.selectedFile.name,
          type: this.selectedFile.type,
          content: await this.readFileAsText(this.selectedFile)
        } : undefined,
        timestamp: new Date()
      });
  
      // Clear the user input and attachments
      this.userInput = '';
      this.selectedImage = null;
      this.selectedFile = null;
    }

    // Prepare the payload without timestamps
    const apiMessages = this.messages.map(msg => ({
      role: msg.role,
      ...(msg.name && { name: msg.name }),
      ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id }),
      content: msg.image ? [
        {
          type: "text",
          text: msg.content
        },
        {
          type: "image_url",
          image_url: {
            url: msg.image
          }
        }
      ] : msg.content
    }));

    const runConversation = async (isInitialCall = true, toolMessages: Message[] = []) => {
      try {
        const response = await this.client.chat.completions.create({
          messages: [
            ...(this.systemPrompt ? [{ role: 'system', content: this.systemPrompt }] : []),
            ...(isInitialCall ? apiMessages : [...apiMessages, ...toolMessages.map(msg => ({
              role: msg.role,
              ...(msg.name && { name: msg.name }),
              ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id }),
              content: msg.image ? [
                {
                  type: "text",
                  text: msg.content
                },
                {
                  type: "image_url",
                  image_url: {
                    url: msg.image
                  }
                }
              ] : msg.content
            }))]),
          ],
          model: this.model,
          temperature: 0.75,
          stream: true,
          tools: tools.length > 0 && isInitialCall ? tools : undefined,
        });

        // Add timestamp when creating assistant message locally
        let assistantMessage = { 
          role: 'assistant', 
          content: '', 
          timestamp: new Date()
        };
        this.messages.push(assistantMessage);

        for await (const part of response) {
          if (this.isStreamStopped) break;

          if (part.choices[0].delta?.content) {
            assistantMessage.content += part.choices[0].delta.content;
            this.content.scrollToBottom(300);
          } else if (part.choices[0].delta?.tool_calls) {
            const toolCall = part.choices[0].delta.tool_calls[0];
            
            // Handle tool calls based on the tool name
            if (toolCall.function) {
              let toolResult = '';
              const args = JSON.parse(toolCall.function.arguments);

              // Show processing message
              this.messages.push({
                role: 'assistant',
                content: `${toolCall.function.name} is processing...`,
                tool_call_id: toolCall.id,
                timestamp: new Date(), // Add timestamp
              });

              switch (toolCall.function.name) {
                case 'webgroundtool':
                  toolResult = await this.webgroundtool(args.query);
                  break;
                case 'imagetool':
                  toolResult = await this.imagetool(args.description);
                  break;
                case 'learningtool':
                  toolResult = await this.learningtool(args);
                  break;
              }

              // Remove processing message
              this.messages = this.messages.filter(m => m.tool_call_id !== toolCall.id);

              // Add tool result
              const toolMessage: Message = {
                role: 'assistant',
                name: toolCall.function.name,
                content: toolResult,
                tool_call_id: toolCall.id,
                timestamp: new Date(), // Add timestamp
              };

              await runConversation(false, [toolMessage]);
              return;
            }
          }
        }

        if (this.isStreamStopped) {
          assistantMessage.content += " [forced stop, by user]";
        }

      } catch (error) {
        console.error('Error in conversation:', error);
        this.messages.push({
          role: 'assistant',
          content: 'An error occurred while processing your request. Please click the redo button above to try again.',
          timestamp: new Date()
        });
      }
    };

    await runConversation();

    this.userInput = '';
    this.selectedImage = null;
    this.selectedFile = null;
    this.saveCurrentSession();
    this.isStreaming = false;
    this.content.scrollToBottom(300);
  }

  async learningtool(args: LearningToolCall): Promise<string> {
    try {
      const currentInfo = await this.storage.get('learnedUserInfo') || '';
      let updatedInfo = currentInfo;
  
      if (args.action === 'add') {
        // Add new information while avoiding duplicates
        const newInfo = args.information.trim();
        if (!currentInfo.includes(newInfo)) {
          updatedInfo = currentInfo ? `${currentInfo}\n${newInfo}` : newInfo;
        }
      } else if (args.action === 'remove') {
        // Remove specific information
        const lines = currentInfo.split('\n');
        updatedInfo = lines
          .filter((line: string) => !line.includes(args.information))
          .join('\n');
      }
  
      await this.storage.set('learnedUserInfo', updatedInfo);
      
      // Update system prompt with learned information
      const basePrompt = await this.storage.get('systemPrompt');
      const updatedPrompt = `${basePrompt}\n\nLearned information about the user:\n${updatedInfo}`;
      await this.storage.set('systemPrompt', updatedPrompt);
  
      return args.action === 'add'
        ? `Successfully learned: ${args.information}`
        : `Successfully removed information about: ${args.information}`;
    } catch (error) {
      console.error('Error in learning tool:', error);
      throw new Error('Failed to process learning operation');
    }
  }

  async imagetool(description: string): Promise<string> {
    const together = new OpenAI({baseURL:"https://api.gaurish.xyz/api/together/v1/", apiKey:"aaa", dangerouslyAllowBrowser:true});
  
    const response = await together.images.generate({
      model: "black-forest-labs/FLUX.1-schnell-Free",
      prompt: description,
      n: 1
    });
    console.log(response.data[0]); 
    console.log('imagetool called with description:', description);
  
    // Store the generated image in the current session
    if (response.data[0].url) {
      // Find the last assistant message using a loop
      let lastAssistantMessage: Message | undefined;
      for (let i = this.messages.length - 1; i >= 0; i--) {
        if (this.messages[i].role === 'assistant') {
          lastAssistantMessage = this.messages[i];
          break;
        }
      }
  
      if (lastAssistantMessage) {
        if (!lastAssistantMessage.generatedImages) {
          lastAssistantMessage.generatedImages = [];
        }
        lastAssistantMessage.generatedImages.push(response.data[0].url);
      }
      return response.data[0].url || '';
    } else {
      return 'Failed to generate image';
    }
  }

  async webgroundtool(query: string, maxResults = 5, baseUrl = 'http://localhost:5000'): Promise<string> {
    try {
      const response = await fetch(`${baseUrl}/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, max_results: maxResults }),
      });
  
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      const data: ResearchResponse = await response.json();
  
      // Create a summary string from the research results
      let summary = `Research results for "${query}":\n\n`;
      data.results.forEach((result, index) => {
        summary += `${index + 1}. ${result.title} (${result.url})\n`;
        summary += `${result.snippet}\n\n`; // Add the snippet
      });
      summary += `Total results: ${data.summary.total_sources}, Execution time: ${data.execution_time}ms`;
  
      return summary;
  
    } catch (error) {
      console.error('Error performing research:', error);
      // Return an error message to the model
      return `Error performing research`; // Or a more user-friendly message
    }
  }

  stopStream() {
    this.isStreamStopped = true;
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  async showErrorToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 3000,
      position: 'top',
      color: 'danger'
    });
    toast.present();
  }

  async showLoading() {
    const loading = await this.loadingController.create({
      message: 'Please wait...',
      spinner: 'crescent'
    });
    await loading.present();
  }

  async hideLoading() {
    await this.loadingController.dismiss();
  }

  triggerFileUpload() {
    this.fileInput.nativeElement.click();
  }

  isMagicSelectionMode = false;
  selectedLines: number[] = [];


  isLineSelected(lineNumber: number): boolean {
    return this.selectedLines.includes(lineNumber);
  }


  actionSheetButtons: ActionSheetButton[] = [];
  async showAssistantMessageOptions(message: Message, index: number) {
    this.selectedAssistantMessageIndex = index;
    this.actionSheetButtons = [
      {
        text: 'Delete Message',
        role: 'destructive',
        icon: 'trash',
        handler: () => {
          if (this.selectedAssistantMessageIndex !== undefined) {
            this.deleteMessage(this.selectedAssistantMessageIndex);
          }
        }
      },
      {
        text: 'Redo Message',
        icon: 'refresh',
        handler: () => {
          if (this.selectedAssistantMessageIndex !== undefined) {
            this.redoAssistantMessage(this.selectedAssistantMessageIndex);
          }
        }
      },
      {
        text: 'Revamp Message',
        icon: 'create',
        handler: () => {
          this.startEditMessage(index);
        }
      },
      {text: 'Copy Message',
        icon: 'copy',
        handler: async () => {
          if (message.content) {
            try {
              await Clipboard.write({
                string: message.content
              });
              const toast = await this.toastController.create({
                message: 'Message copied to clipboard',
                duration: 2000,
                position: 'top',
                color: 'success'
              });
              toast.present();
            } catch (error) {
              console.error('Failed to copy message:', error);
              const toast = await this.toastController.create({
                message: 'Failed to copy message',
                duration: 2000,
                position: 'top',
                color: 'danger'
              });
              toast.present();
            }
          }
        }
      },
      {
        text: 'Cancel',
        role: 'cancel',
        icon: 'close'
      }
    ]
    this.isAssistantMessageOptionsOpen = true;
  }

  startEditMessage(index: number) {
    this.selectedAssistantMessageIndex = index;
    this.editMessageInput = '';
    this.isEditingMessage = true;
    this.activeMessageActions = null;
    // Clear any existing input
    this.userInput = '';
    this.selectedImage = null;
    this.selectedFile = null;
  }

  cancelEdit() {
    this.isEditingMessage = false;
    this.editMessageInput = '';
  }

  startMagicSelect(index: number) {
    this.selectedAssistantMessageIndex = index;
    this.isMagicSelectionMode = true;
    this.isMagicDoneButtonVisible = true;
    this.selectedLines = [];
  }

  completeMagicSelect() {
    this.isMagicDoneButtonVisible = false;
    this.editMessageInput = ' ';
    this.isEditingMessage = true;
  }

  async applyMessageChanges(index: number, changes: string) {
    this.isEditingMessage = false;
    const originalMessage = this.messages[index].content;

    this.isStreaming = true;
    this.isStreamStopped = false;

    try {

      const contextMessages = this.messages.slice(0, index).map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const response = await this.client.chat.completions.create({
        messages: [
          ...(this.systemPrompt ? [{ role: 'system', content: this.systemPrompt }] : []),
          ...contextMessages,
          {
            role: 'user',
            content: `Here's an existing response: "${originalMessage}". 
            I  would like you to make these changes : "${changes}".
            Reply only with the new updated version, do not mention it is a new response or add quotes around it. 
                    `
          }
        ],
        model: this.model,
        temperature: 0.75,
        stream: true
      });

      let newContent = '';

      for await (const part of response) {
        if (this.isStreamStopped) break;

        if (part.choices[0].delta?.content) {
          newContent += part.choices[0].delta.content;

          this.messages[index].content = newContent;
        }

        this.content.scrollToBottom(300);
      }

      if (this.isStreamStopped) {
        this.messages[index].content += " [aborted]";
      }

    } catch (error) {
      console.error('Error updating message:', error);
      await this.showErrorToast('Sorry, I encountered an error updating the message.');

      this.messages[index].content = originalMessage;
    } finally {
      this.isStreaming = false;
      this.saveCurrentSession();
    }
  }

  async redoAssistantMessage(index: number) {
    // Find the preceding user message
    let userMessageIndex = -1;
    for (let i = index - 1; i >= 0; i--) {
      if (this.messages[i].role === 'user') {
        userMessageIndex = i;
        break;
      }
    }

    if (userMessageIndex === -1) {
      await this.showErrorToast('Cannot redo: No user message found.');
      return;
    }

    // Get messages up to and including the user message
    const messagesToSend = this.messages.slice(0, userMessageIndex + 1).map(msg => ({
          role: msg.role,
          ...(msg.name && { name: msg.name }),
          ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id }),
          content: msg.image ? [
            {
              type: "text",
              text: msg.content
            },
            {
              type: "image_url",
              image_url: {
                url: msg.image
              }
            }
          ] : msg.content
    }));

    const originalMessage = this.messages[index].content;

    this.isStreaming = true;
    this.isStreamStopped = false;

    try {
      const response = await this.client.chat.completions.create({
        messages: [
          ...(this.systemPrompt ? [{ role: 'system', content: this.systemPrompt }] : []),
          ...messagesToSend 
        ],
        model: this.model,
        temperature: 0.75,
        stream: true
      });

      // Remove all messages after the user message
      this.messages = this.messages.slice(0, userMessageIndex + 1);
      
      let assistantMessage = { role: 'assistant', content: '', timestamp: new Date() };
      this.messages.push(assistantMessage);

      for await (const part of response) {
        if (this.isStreamStopped) break;

        if (part.choices[0].delta?.content) {
          assistantMessage.content += part.choices[0].delta.content;
        }

        this.content.scrollToBottom(300);
      }

      if (this.isStreamStopped) {
        assistantMessage.content += " [aborted]";
      }

    } catch (error) {
      console.error('Error redoing message:', error);
      await this.showErrorToast('Sorry, I encountered an error redoing the message.');
      this.messages[index].content = originalMessage;
    } finally {
      this.isStreaming = false;
      this.saveCurrentSession();
    }
    this.activeMessageActions = null;
  }

 // Array to track copy status for each code block

 toggleRightSidebar() {
  this.isRightSidebarOpen = !this.isRightSidebarOpen;
}

async copyCode(code: string) { 
  try {
    await Clipboard.write({
      string: code // Copy the original code directly 
    });
    this.isCopied = true;
    setTimeout(() => {
      this.isCopied = false;
    }, 2000);
  } catch (error) {
    console.error('Failed to copy code:', error);
    this.showErrorToast('Failed to copy code. Please try again.');
  }
}

  showTemplatesAndRefresh() {
    this.showTemplatesPage = true;
    // Restore the previous template toggle state instead of forcing it true
    this.storage.get('templateToggleEnabled').then(savedState => {
      this.isTemplateToggleEnabled = savedState !== null ? savedState : true;
    });
    
    if (location.pathname === '/home') {
      this.currentSessionIndex = -1;
      this.currentSessionName = '';
      // No need to reload the page
    }
  }

  showCodeSnippet(code: string, language?: string) {
    this.selectedCodeSnippet = code;
    this.toggleRightSidebar();
    this.isRightSidebarOpen = true;
  
    setTimeout(() => {
      if (this.codeSnippetContainer) {
        const languageClass = language ? `language-${language}` : '';
        
        // Create the code snippet HTML using our escape function
        this.codeSnippetContainer.nativeElement.innerHTML = `
          <pre><code class="${languageClass}">${this.escapeHtml(code)}</code></pre>
          <button class="copy-button" (click)="copyCode(selectedCodeSnippet)">
            <ion-icon name="clipboard-outline"></ion-icon>
            <span *ngIf="!isCopied">Copy</span>
            <span *ngIf="isCopied">Copied!</span>
          </button>
        `;
  
        // Apply highlighting
        const codeElement = this.codeSnippetContainer.nativeElement.querySelector('code');
        if (codeElement) {
          hljs.highlightElement(codeElement);
        }
      }
    });
  }
  
  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  detectLanguage(code: string): string | null {
    const registeredLanguages = hljs.listLanguages();
    for (const lang of registeredLanguages) {
      const language = hljs.getLanguage(lang);
      if (language) {
        const highlightedCode = hljs.highlight(code, { language: lang, ignoreIllegals: true });
        if (highlightedCode.value !== code) {
          return lang;
        }
      }
    }
    return null;
  }
  trackByTemplateId(index: number, template: Template): string {
    return template.name;
  }

  // Add these methods
  startEditingSession(index: number, event: Event) {
    event.stopPropagation(); // Prevent switching to the session
    this.editingSessionIndex = index;
    this.editedSessionName = this.sessions[index].name;
  }

  saveSessionName(index: number, event: Event) {
    event.stopPropagation(); // Prevent switching to the session
    if (this.editedSessionName.trim()) {
      this.sessions[index].name = this.editedSessionName.trim();
      this.saveCurrentSession();
    }
    this.cancelEditingSession();
  }

  cancelEditingSession() {
    this.editingSessionIndex = null;
    this.editedSessionName = '';
  }

  editingUserMessageIndex: number | null = null;
  editingUserMessageContent: string = '';


  // Add property to track active message actions menu
  activeMessageActions: number | null = null;

  // Add method to toggle message actions
  toggleMessageActions(index: number, role: string) {
    this.activeMessageActions = this.activeMessageActions === index ? null : index;
  }

  // Add method to copy message to clipboard
  async copyMessageToClipboard(content: string) {
    try {
      await Clipboard.write({
        string: content
      });
      this.showToast('Message copied to clipboard', 'success');
    } catch (error) {
      this.showErrorToast('Failed to copy message');
    }
    this.activeMessageActions = null;
  }

  // Add click handler to close menu when clicking outside
  @HostListener('document:click', ['$event'])
  handleClick(event: Event) {
    if (this.activeMessageActions !== null && 
        !(event.target as HTMLElement).closest('.message-actions') &&
        !(event.target as HTMLElement).closest('.toggle-actions')) {
      this.activeMessageActions = null;
    }
  }

  async showToast(message: string, color: 'success' | 'danger' | 'warning' = 'success') {
    const toast = await this.toastController.create({
      message: message,
      duration: 2000,
      position: 'top',
      color: color
    });
    toast.present();
  }

  openDocumentation() {
    window.open('https://github.com/gaurishmehra/Gaurika/blob/main/Documentation.md', '_blank');
  }

  getCategoryForTemplate(template: Template): string {
    // Add logic to determine category based on template name or other properties
    if (template.name.includes('Writing')) return 'Writing';
    if (template.name.includes('Programming')) return 'Development';
    if (template.name.includes('Physics') || template.name.includes('Math')) return 'Academic';
    if (template.name.includes('Business')) return 'Business';
    return 'General';
  }

  /**
   * Starts a new chat session without a template
   */
  async startQuickChat() {
    this.showTemplatesPage = false;
    this.messages = [];
    this.currentSessionIndex = -1;
    this.currentSessionName = '';
    
    // Create a new session if none exists
    if (this.sessions.length === 0) {
      this.sessions.push({
        name: 'New Chat',
        messages: [],
        generatedImages: []
      });
      this.currentSessionIndex = 0;
      await this.saveCurrentSession();
    }
  }

  /**
   * Sets the active category and filters templates
   */
  setCategory(categoryId: string) {
    if (!this.isTemplateToggleEnabled) return;
  
    this.selectedCategory = categoryId;
    if (categoryId === 'all') {
      this.filteredTemplates = [...this.templateConversations];
    } else {
      this.filteredTemplates = this.templateConversations.filter(
        template => template.category === categoryId
      );
    }
  }

  touchStartX: number = 0;
  touchEndX: number = 0;

  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent) {
    this.touchStartX = event.changedTouches[0].screenX;
  }

  @HostListener('touchend', ['$event'])
  onTouchEnd(event: TouchEvent) {
    this.touchEndX = event.changedTouches[0].screenX;
    this.handleGesture();
  }

  handleGesture() {
    if (this.touchEndX - this.touchStartX > 50) {
      // Swiped from left to right
      this.isSidebarOpen = true;
    } else if (this.touchStartX - this.touchEndX > 50) {
      // Swiped from right to left
      this.isSidebarOpen = false;
    }
  }

  // Add this property
  isImagePreviewOpen = false;
  selectedPreviewImage: string | null = null;

  // Add this method for image preview
  async showImagePreview(imageUrl: string) {
    this.selectedPreviewImage = imageUrl;
    this.isImagePreviewOpen = true;
  }

  closeImagePreview() {
    this.isImagePreviewOpen = false;
    this.selectedPreviewImage = null;
  }

  // Add this helper method
  isInputDisabled(): boolean {
    return this.isStreaming || this.isEditingMessage || this.editingUserMessageIndex !== null;
  }

  // Update the toggleTemplates method
  async toggleTemplates() {
    this.isTemplateToggleEnabled = !this.isTemplateToggleEnabled;
    await this.storage.set('templateToggleEnabled', this.isTemplateToggleEnabled);
    
    // Clear template data from memory when disabled
    if (!this.isTemplateToggleEnabled) {
      this.filteredTemplates = [];
      this.templateSuggestions = [];
    } else {
      // Restore template data when enabled
      this.filteredTemplates = [...this.templateConversations];
      this.templateSuggestions = [...this.templateConversations];
    }
    
    // Show toast notification
    const message = this.isTemplateToggleEnabled ? 
      'Full UI restored' : 
      'Switched to minimal mode';
    await this.showToast(message, 'success');
  }

  // Add method to check performance mode
  get isMinimalMode(): boolean {
    return !this.isTemplateToggleEnabled;
  }

  // Debounce search input
  private searchDebounceTimer: any;
  
  // Cache DOM queries
  private heroSection: HTMLElement | null = null;

  // Add this method for virtual scrolling
  async loadMessages(event?: any) {
    if (this.isLoadingMore) return;
    
    this.isLoadingMore = true;
    const start = this.currentPage * this.pageSize;
    const end = start + this.pageSize;
    
    // Get subset of messages
    const newMessages = this.messages.slice(start, end);
    
    if (newMessages.length) {
      // Add new messages to visible messages
      this.visibleMessages.unshift(...newMessages);
      this.currentPage++;
    }
    
    this.isLoadingMore = false;
    if (event) {
      event.target.complete();
      if (end >= this.messages.length) {
        event.target.disabled = true;
      }
    }
  }

  // Add method to reset virtual scroll
  resetVirtualScroll() {
    this.currentPage = 0;
    this.visibleMessages = [];
    this.loadMessages();
  }

  // Add minimal mode suggestion handler
  async handleMinimalSuggestion(suggestion: string) {
    this.userInput = suggestion;
    await this.sendMessage();
  }
}