import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
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
  ActionSheetController
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


interface Message {
  role: string;
  content: string;
  image?: string | null;
  file?: { name: string; type: string; content: string };
  tool_call_id?: string;
  isToolCallInProgress?: boolean
  name?: string;
  generatedImages?: string[];
}

interface MessagePart {
  type: 'text' | 'code';
  content: string;
  startIndex: number; // To track line numbers correctly for magic selection
}

interface ActionSheetButton {
  text: string;
  role?: 'destructive' | 'cancel';
  icon?: string;
  handler?: () => void;
  disabled?: boolean;
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule, CommonModule],
})
export class HomePage implements OnInit {
  @ViewChild('pageTitle') pageTitle!: ElementRef;
  @ViewChild('pageSubtitle') pageSubtitle!: ElementRef;
  userInput = '';
  messages: Message[] = [];
  client: any;
  model = 'llama3.1-70b';
  systemPrompt = '';
  sessions: { 
    name: string; 
    messages: Message[]; 
    fileContext?: { name: string; type: string; content: string };
    generatedImages?: string[]; // Store generated images per session
  }[] = [];
  currentSessionIndex = 0;
  currentSessionName = 'Default Session';
  newSessionName = '';
  @ViewChild(IonContent) content!: IonContent;
  @ViewChild('fileInput') fileInput!: ElementRef;
  isSessionMenuOpen = false;
  isCreateSessionModalOpen = false;
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

  isAssistantMessageOptionsOpen = false;
  selectedAssistantMessageIndex: number | undefined = undefined;

  isEditingMessage = false;
  editMessageInput = ' ';

  templateConversations: { name: string; prompt: string }[] = [
    {
      name: 'Creative Writing',
      prompt:
        'Write a short story about a talking cat who goes on an adventure.',
    },
    {
      name: 'Code Generation',
      prompt:
        'Generate Python code for a function that calculates the factorial of a number.',
    },
    {
      name: 'Physics',
      prompt: 'What is the theory of general relativity and how is it different from the theory of special relativity?',
    },
    {
      name: 'Chemistry',
      prompt: 'What was the Bohr model of the atom and how was it proven wrong?',
    },
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
    private webGroundingService: WebGroundingService
  ) {}

  @ViewChild('messageInput') messageInput!: ElementRef;

  handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  async ngOnInit() {
    await this.storage.create();
    this.isImageGenEnabled = 
    (await this.storage.get('isImageGenEnabled')) || false;

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
    const alert = await this.alertController.create({
      header: 'Welcome!',
      message: "If you're using this for the first time, please review the settings and click 'Save Settings' at the bottom to apply the default configuration. Advanced users can add custom OpenAI-compatible base URLs and endpoints in the advanced settings menu. Note: web grounding and some features are still in development.",
      buttons: [
        {
          text: 'OK',
          handler: () => {
            this.settingsService.saveDefaultSettings();
          }
        }
      ]
    });

    await alert.present();

    setTimeout(() => {
      alert.dismiss();
    }, 60000);
  }

  async initializeOpenAIClient() {
    const storedApiKey = await this.storage.get('apiKey');
    const storedBaseUrl = await this.storage.get('baseUrl');

    if (storedApiKey && storedBaseUrl) {
      this.initializesdk(storedApiKey, storedBaseUrl);
    } else {
      console.warn('No API key or base URL selected. Please configure in settings.');
    }
  }

  initializesdk(apiKey: string, baseUrl?: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl || 'https://api.cerebras.ai/',
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
  showTemplates() {
    this.showTemplatesPage = true;
    this.toggleSessionMenu();
    if (this.showTemplatesPage) { // Only center text if on templates page
      this.centerTextElements();
    }
  }


  onUserInput() {
    if (this.showTemplatesPage && this.userInput.trim() !== '') {
      this.showTemplatesPage = false;
    }
  }

  toggleSessionMenu() {
    this.isSessionMenuOpen = !this.isSessionMenuOpen;
    if (this.isSessionMenuOpen) {
      this.isCreateSessionModalOpen = false;
    }
  }

  toggleCreateSessionModal() {
    this.isCreateSessionModalOpen = !this.isCreateSessionModalOpen;
    if (this.isCreateSessionModalOpen) {
      this.isSessionMenuOpen = false;
    }
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
        isInCodeBlock = !isInCodeBlock;
  
        if (isInCodeBlock) {
          // Start of a code block
          parts.push(currentPart);
          currentPart = { type: 'code', content: '', startIndex: lineNumber };
        } else {
          // End of a code block
          parts.push(currentPart);
          currentPart = { type: 'text', content: '', startIndex: lineNumber + 1 };
        }
      } else {
        currentPart.content += line + '\n';
      }
  
      lineNumber++;
    });
  
    parts.push(currentPart); // Add the last part
  
    return parts;
  }
  
  trimCodeBlock(code: string): string {
    return code.split('\n').map(line => line.trim()).join('\n'); 
  }

  async createNewSessionFromMessage(message: string) {
    // Create a new session with a default name
    const defaultSessionName = 'New Chat';
    this.sessions.push({
      name: defaultSessionName,
      messages: [],
      generatedImages: [] // Initialize here
    });
  
    this.currentSessionIndex = this.sessions.length - 1;
    this.currentSessionName = defaultSessionName;
    this.showTemplatesPage = false;
  
    // Save the current session
    this.saveCurrentSession();
  
    // Set the userInput to the passed message
    this.userInput = message;
  
    // Send the message
    await this.sendMessage();
  
    // After the assistant replies, update the session name
    try {
      // First, try to generate a name using the API
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'Generate a concise 1-3 word title for this conversation. Reply only with the title, nothing else.(Do not include quotes around the title)'
          },
          {
            role: 'user',
            content: message // Use the passed message here
          },
        ],
        max_tokens: 10
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

  createNewSession() {
    this.toggleCreateSessionModal();
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
      this.toggleCreateSessionModal();
      this.newSessionName = '';
      this.saveCurrentSession();
    }
  }

  loadCurrentSession() {
    this.showTemplatesPage = false;
    this.messages = this.sessions[this.currentSessionIndex].messages;
    this.currentSessionName = this.sessions[this.currentSessionIndex].name;
    setTimeout(() => {
      this.content.scrollToBottom(300);
    });
  }

  saveCurrentSession() {
    this.sessions[this.currentSessionIndex].messages = this.messages;
    this.storage.set('sessions', this.sessions);
  }

  switchSession(index: number) {
    if (!this.isMultimodalEnabled && this.sessions[index].messages.some(m => m.image)) {
      this.showErrorToast('This session contains images and cannot be accessed with the current model. Please enable multimodal mode in settings.');
      return;
    }

    this.currentSessionIndex = index;
    this.loadCurrentSession();
    this.toggleSessionMenu();
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
    return this.messages.filter((m) => m.role !== 'tool');
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

  async startConversation(template: { name: string; prompt: string }) {
    this.showTemplatesPage = false;
  
    this.sessions.push({
      name: template.name,
      messages: [],
      generatedImages: [] // Initialize generatedImages here
    });

    this.currentSessionIndex = this.sessions.length - 1;
    this.currentSessionName = template.name;
    this.loadCurrentSession();

    this.userInput = template.prompt;
    await this.sendMessage();
  }

  getIconForTemplate(templateName: string): string {
    switch (templateName) {
      case 'Creative Writing':
        return 'create-outline';
      case 'Code Generation':
        return 'code-slash-outline';
      case 'Physics':
        return 'flask-outline';
      case 'Chemistry':
        return 'flask-outline';
      default:
        return 'chatbubbles-outline';
    }
  }

  async sendMessage() {
    if (!this.client) {
      await this.initializeOpenAIClient();
      if (!this.client) {
        await this.showErrorToast('API client not initialized. Please check your API key settings.');
        return;
      }
    }

    const messageContent = this.userInput.trim();
    if (messageContent === '' && !this.selectedFile && !this.sessions[this.currentSessionIndex].fileContext) return;

    // If starting a new conversation from templates or if no sessions exist, create a new session
    if (this.showTemplatesPage || this.sessions.length === 0) {
      await this.createNewSessionFromMessage(messageContent);
      return; // The message has already been sent in createNewSessionFromMessage
    }

    this.isStreaming = true;
    this.isStreamStopped = false;

    let imageContent = this.selectedImage;


    if (this.selectedFile && !this.selectedFile.type.startsWith('image/')) {
      const fileContent = await this.readFileAsText(this.selectedFile);
      this.sessions[this.currentSessionIndex].fileContext = {
        name: this.selectedFile.name,
        type: this.selectedFile.type,
        content: fileContent
      };
  
      // Create a new message for each file
      this.messages.push({
        role: 'user',
        content: messageContent + (messageContent ? "\n\n" : "") + `File Context - Title: ${this.selectedFile.name}\nContent: ${fileContent}` 
      });
  
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            ...(this.systemPrompt ? [{ role: 'system', content: this.systemPrompt }] : []),
            ...this.messages 
          ],
          max_tokens: 4096,
          stream: true,
        });

        let assistantMessage: Message = { role: 'assistant', content: '' };
        this.messages.push(assistantMessage);

        for await (const part of response) {
          if (this.isStreamStopped) {
            break;
          }

          if (part.choices && part.choices[0] && part.choices[0].delta?.content) {
            assistantMessage.content += part.choices[0].delta.content;
            this.content.scrollToBottom(300);
          }
        }

        if (this.isStreamStopped) {
          assistantMessage.content += " [aborted]";
        }

      } catch (error) {
        console.error('Error calling OpenAI API with file:', error);
        await this.showErrorToast('Sorry, I encountered an error processing your request with the file.');
      }

    } else if (this.isMultimodalEnabled) {
      let newMessage: Message = {
        role: 'user',
        content: messageContent,
        image: imageContent || undefined,
      };
      this.messages.push(newMessage);

      let apiMessages = await Promise.all(this.messages.map(async (msg) => {
        if (msg.image) {
          return {
            role: msg.role,
            content: [
              { type: 'text', text: msg.content },
              { type: 'image_url', image_url: { url: msg.image } }
            ]
          };
        } else {
          return { role: msg.role, content: msg.content };
        }
      }));

      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: apiMessages,
          max_tokens: 4096,
          stream: true,
        });

        let assistantMessage: Message = { role: 'assistant', content: '' };
        this.messages.push(assistantMessage);

        for await (const part of response) {
          if (this.isStreamStopped) {
            break;
          }

          if (part.choices && part.choices[0] && part.choices[0].delta?.content) {
            assistantMessage.content += part.choices[0].delta.content;
            this.content.scrollToBottom(300);
          }
        }

        if (this.isStreamStopped) {
          assistantMessage.content += " [aborted]";
        }

      } catch (error) {
        console.error('Error calling OpenAI API:', error);
        await this.showErrorToast('Sorry, I encountered an error processing your request.');
      }

    }  else if (this.isWebGroundingEnabled) {
      this.messages.push({ role: 'user', content: messageContent });
    
      const tools = [
        {
          type: 'function',
          function: {
            name: 'webgroundtool',
            description: "Use this tool to search the web for factual information related to the user's request.",
            parameters: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'query to search the web',
                },
              },
              required: ['query'],
            },
          },
        },
      ];
    
      const runConversation = async (isInitialCall = true, toolMessages: Message[] = []) => {
        // Add the webgroundtool instruction to the system prompt if enabled
        const systemPromptWithWebGrounding = this.isWebGroundingEnabled
          ? `${this.systemPrompt} Note that you may call the webgroundtool to gain information on a current topic and or a topic you believe you do not have information on.`
          : this.systemPrompt;
    
        const messagesToSend = isInitialCall
          ? this.messages
          : [...this.messages, ...toolMessages];
    
        try {
          const response = await this.client.chat.completions.create({
            messages: [
              ...(systemPromptWithWebGrounding
                ? [{ role: 'system', content: systemPromptWithWebGrounding }]
                : []),
              ...messagesToSend,
            ],
            model: this.model,
            temperature: 0.75,
            stream: true,
            tools: isInitialCall ? tools : undefined,
          });
    
          let assistantMessage = { role: 'assistant', content: '' };
          this.messages.push(assistantMessage);
    
          for await (const part of response) {
            if (this.isStreamStopped) {
              break;
            }
    
            if (part.choices[0].delta?.content) {
              assistantMessage.content += part.choices[0].delta.content;
            } else if (part.choices[0].delta?.tool_calls) {
              const toolCall = part.choices[0].delta.tool_calls[0];
              if (toolCall.function.name === 'webgroundtool') {
                const args = JSON.parse(toolCall.function.arguments);
                const query = args.query;
    
                // Show "Processing..." message in the UI (without isToolCallInProgress)
                this.messages.push({
                  role: 'assistant',
                  content: 'WebGround Tool is processing...',
                  tool_call_id: toolCall.id,
                });
    
                if (query) {
                  const webgroundingResult = await this.webgroundtool(query);
                  console.log('webgroundtool query:', query);
    
                  this.messages = this.messages.filter(
                    (m) => m.tool_call_id !== toolCall.id
                  );
    
                  const toolMessage: Message = {
                    role: 'tool',
                    name: 'WebGround Tool',
                    content: webgroundingResult,
                    tool_call_id: toolCall.id,
                  };
    
                  await runConversation(false, [toolMessage]);
                  return;
                }
              }
            }
    
            this.content.scrollToBottom(300);
          }
    
          if (this.isStreamStopped) {
            assistantMessage.content += " [aborted]";
          }
    
        } catch (error) {
          console.error('Error in web grounding1:', error);
          await this.showErrorToast('Sorry, I encountered an error during web grounding.');
        }
      };
    
      await runConversation();
    } 

    else if (this.isImageGenEnabled) {
      this.messages.push({ role: 'user', content: messageContent });
    
      const tools = [
        {
          type: 'function',
          function: {
            name: 'imagetool',
            description: "Use this tool to generate an image based on the user's description.",
            parameters: {
              type: 'object',
              properties: {
                description: {
                  type: 'string',
                  description: 'Description of the image to generate',
                },
              },
              required: ['description'],
            },
          },
        },
      ];
    
      const runConversation = async (isInitialCall = true, toolMessages: Message[] = []) => {
        const systemPromptWithImageGen = this.isImageGenEnabled
          ? `${this.systemPrompt} Note that you may call the imagetool to generate an image.`
          : this.systemPrompt;
    
        const messagesToSend = isInitialCall
          ? this.messages
          : [...this.messages, ...toolMessages];
    
        try {
          const response = await this.client.chat.completions.create({
            messages: [
              ...(systemPromptWithImageGen
                ? [{ role: 'system', content: systemPromptWithImageGen }]
                : []),
              ...messagesToSend,
            ],
            model: this.model,
            temperature: 0.75,
            stream: true,
            tools: isInitialCall ? tools : undefined,
          });
    
          let assistantMessage = { role: 'assistant', content: '' };
          this.messages.push(assistantMessage);
    
          for await (const part of response) {
            if (this.isStreamStopped) {
              break;
            }
    
            if (part.choices[0].delta?.content) {
              assistantMessage.content += part.choices[0].delta.content;
            } else if (part.choices[0].delta?.tool_calls) {
              const toolCall = part.choices[0].delta.tool_calls[0];
              if (toolCall.function.name === 'imagetool') {
                const args = JSON.parse(toolCall.function.arguments);
                const description = args.description;
    
                this.messages.push({
                  role: 'assistant',
                  content: 'Image Tool is processing...',
                  tool_call_id: toolCall.id,
                });
    
                if (description) {
                  const imageGenerationResult = await this.imagetool(description);
    
                  // Find the message with the matching tool_call_id
                  const messageToUpdate = this.messages.find(m => m.tool_call_id === toolCall.id);
    
                  if (messageToUpdate) {
                    // Remove the "Image Tool is processing..." message
                    this.messages = this.messages.filter(m => m !== messageToUpdate);
    
                    // Update the content of the assistant message with the image URL or description
                    messageToUpdate.content = this.isMultimodalEnabled
                      ? imageGenerationResult  // Use image URL if multimodal is enabled
                      : `Image generated with description: ${description}`; // Otherwise, use description
                    messageToUpdate.generatedImages = [imageGenerationResult]; // Store the image URL
    
                    // Add the updated message back to the messages array
                    this.messages.push(messageToUpdate);
    
                    // Call runConversation recursively without any tool messages
                    // await runConversation(false, []); // No tool messages needed here
                    return;
                  }
                }
              }
            }
    
            this.content.scrollToBottom(300);
          }
    
          if (this.isStreamStopped) {
            assistantMessage.content += " [aborted]";
          }
    
        } catch (error) {
          console.error('Error in image generation:', error);
          await this.showErrorToast('Sorry, I encountered an error during image generation.');
        }
      };
    
      await runConversation();
    }

     else {
      this.messages.push({ role: 'user', content: messageContent });

      this.abortController = new AbortController();

      try {
        const response = await this.client.chat.completions.create({
          messages: [
            ...(this.systemPrompt
              ? [{ role: 'system', content: this.systemPrompt }]
              : []),
            ...this.messages,
          ],
          model: this.model,
          temperature: 0.75,
          stream: true
        });

        let assistantMessage = { role: 'assistant', content: '' };
        this.messages.push(assistantMessage);

        for await (const part of response) {
          if (this.isStreamStopped) {
            break;
          }

          if (part.choices[0].delta?.content) {
            assistantMessage.content += part.choices[0].delta.content;
          }

          this.content.scrollToBottom(300);
        }

        if (this.isStreamStopped) {
          assistantMessage.content += " [aborted]";
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log('Request aborted');
        } else if (error.response) {

          console.error('Server Error:', error.response.data);
          await this.showErrorToast(`Server Error: ${error.response.data.error.message || 'Unknown error'}`);
        } else if (error.request) {

          console.error('Network Error:', error.request);
          await this.showErrorToast('Network Error: Could not connect to the server.');
        } else {

          console.error('Client Error:', error.message);
          await this.showErrorToast(`Client Error: ${error.message}`);
        }
      } finally {
        this.abortController = null;
      }
    }

    this.userInput = '';
    this.selectedImage = null;
    this.selectedFile = null;
    this.saveCurrentSession();
    this.isStreaming = false;
    this.content.scrollToBottom(300);
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

  async webgroundtool(query: string): Promise<string> {
    console.log('webgroundtool called with query:', query);
  
    try {
      const response = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`);
      const text = await response.text(); // Get the response as text
  
      // Return the first 6000 words (or less if the text is shorter)
      const words = text.split(/\s+/);
      return words.slice(0, 1000).join(' ');
    } catch (error) {
      console.error('Error calling webgroundtool:', error);
      throw error;
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

  toggleMagicSelectionMode() {
    this.isMagicSelectionMode = !this.isMagicSelectionMode;
    if (!this.isMagicSelectionMode) {
      this.selectedLines = [];
    }
  }

  toggleLineSelection(lineNumber: number) {
    if (this.isMagicSelectionMode) {
      const messageContent = this.messages[this.selectedAssistantMessageIndex!].content;
      const codeBlockLines = this.getCodeBlockLineNumbers(messageContent); 

      if (codeBlockLines.includes(lineNumber)) {
        // If clicked line is in a code block, select the whole block
        this.selectedLines = codeBlockLines; 
      } else {
        // Otherwise, handle individual line selection
        const index = this.selectedLines.indexOf(lineNumber);
        if (index > -1) {
          this.selectedLines.splice(index, 1);
        } else {
          this.selectedLines.push(lineNumber);
        }
        this.selectedLines.sort();
      }
    }
  }

  getCodeBlockLineNumbers(content: string): number[] {
    const lines = content.split('\n');
    let codeBlockLines: number[] = [];
    let isInCodeBlock = false;
    
    lines.forEach((line, i) => {
      if (line.trim().startsWith('```')) {
        isInCodeBlock = !isInCodeBlock;
        if (isInCodeBlock) {
          codeBlockLines.push(i); 
        }
      } else if (isInCodeBlock) {
        codeBlockLines.push(i);
      }
    });
    return codeBlockLines;
  }

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
      {
        text: 'Magic Select',
        icon: 'create-outline',
        handler: () => {
          this.startMagicSelect(index);
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
    this.editMessageInput = ' ';
    this.isEditingMessage = true;
  }

  cancelEdit() {
    this.isEditingMessage = false;
    this.editMessageInput = ' ';
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

  async applyMagicSelectChanges(index: number, changes: string) {
    this.isMagicSelectionMode = false;
    this.isMagicDoneButtonVisible = false;
    this.isEditingMessage = false;

    const originalMessage = this.messages[index].content;
    const lines = originalMessage.split('\n');

    let selectedText = "";
    let isInCodeBlock = false;
    let codeBlockLines: number[] = [];


    lines.forEach((line, i) => {
      if (line.trim().startsWith('```')) {
        isInCodeBlock = !isInCodeBlock;
        if (isInCodeBlock) {
          codeBlockLines.push(i);
        }
      } else if (isInCodeBlock) {
        codeBlockLines.push(i);
      }
    });


    this.selectedLines.forEach(lineNumber => {
      if (codeBlockLines.includes(lineNumber)) {

        const firstCodeBlockLine = codeBlockLines.find(lineNum => this.selectedLines.includes(lineNum));

        if (firstCodeBlockLine !== undefined) {
          const codeBlockStartIndex = codeBlockLines.indexOf(firstCodeBlockLine);
          const codeBlockEndIndex = codeBlockLines.lastIndexOf(firstCodeBlockLine);


          for (let i = codeBlockStartIndex; i <= codeBlockEndIndex; i++) {
            if (!this.selectedLines.includes(codeBlockLines[i])) {
              this.selectedLines.push(codeBlockLines[i]);
            }
          }
        }
      }
    });


    this.selectedLines = [...new Set(this.selectedLines)].sort((a, b) => a - b);


    this.selectedLines.forEach(lineNumber => {
      selectedText += lines[lineNumber] + "\n";
    });

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
            content: `Original response: "${originalMessage}"

I want to specifically edit these lines:
${selectedText}

Changes to make: ${changes}

Please provide the COMPLETE updated response, with ONLY the specified lines edited. Keep all other parts of the response exactly the same. Make sure to properly handle any code blocks, preserving their formatting. DO not mention this is an update or anything of that nature.`
          }
        ],
        model: this.model,
        temperature: 0.75,
        stream: true
      });

      let newContent = ' ';

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
      this.selectedLines = [];
      this.editMessageInput = ' ';
      this.selectedAssistantMessageIndex = undefined;
    }
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
    if (index === this.messages.length - 1) {
      this.retryLastAssistantMessage();
      return;
    }
  
    const messagesToSend = this.messages.slice(0, index);
    const originalMessage = this.messages[index].content;
  
    this.isStreaming = true;
    this.isStreamStopped = false;
  
    try {
      const response = await this.client.chat.completions.create({
        messages: [
          ...(this.systemPrompt ? [{ role: 'system', content: this.systemPrompt }] : []),
          ...messagesToSend // No need to modify messagesToSend as file content is already embedded
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
      console.error('Error redoing message:', error);
      await this.showErrorToast('Sorry, I encountered an error redoing the message.');
  
      this.messages[index].content = originalMessage;
    } finally {
      this.isStreaming = false;
      this.saveCurrentSession();
    }
  }

  isCopied: boolean[] = []; // Array to track copy status for each code block

  async copyCode(code: string, index: number) {
    try {
      await Clipboard.write({
        string: code
      });
  
      this.isCopied[index] = true; // Set copied status to true for the clicked button
  
      setTimeout(() => {
        this.isCopied[index] = false; // Reset copied status after 2 seconds
      }, 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
      this.showErrorToast('Failed to copy code. Please try again.');
    }
  }

  showTemplatesAndRefresh() {
    // this.showTemplates();
    window.location.reload();
  }
}