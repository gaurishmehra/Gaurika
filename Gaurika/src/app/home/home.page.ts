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
  isToolCallInProgress?: boolean;
  isFile?: boolean;
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
  userInput = '';
  messages: Message[] = [];
  client: any;
  model = 'llama3.1-70b';
  systemPrompt = '';
  sessions: { name: string; messages: Message[]; fileContext?: { name: string; type: string; content: string } }[] = [];
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

  getFileIcon(fileType: string): string {
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
        return 'document-outline';
    }
  }


  openSettings() {
    this.router.navigate(['/settings']);
  }
  showTemplates() {
    this.showTemplatesPage = true;
    this.toggleSessionMenu();
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

  async createNewSessionFromMessage(message: string) {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant. Based on the user\'s message, generate a concise 1-3 word title that captures the essence of what might be discussed. Respond with ONLY the title, nothing else.'
          },
          {
            role: 'user',
            content: message
          }
        ],
        max_tokens: 10
      });

      let sessionName = response.choices[0].message.content?.trim() || 'New Chat';

      if (sessionName.length > 20) {
        sessionName = sessionName.substring(0, 20) + '...';
      }

      this.sessions.push({
        name: sessionName,
        messages: []
      });

      this.currentSessionIndex = this.sessions.length - 1;
      this.currentSessionName = sessionName;
      this.showTemplatesPage = false;

      this.saveCurrentSession();
    } catch (error) {
      console.error('Error generating session name:', error);
      this.sessions.push({
        name: 'New Chat',
        messages: []
      });
      this.currentSessionIndex = this.sessions.length - 1;
      this.currentSessionName = 'New Chat';
      this.showTemplatesPage = false;
    }
  }

  createNewSession() {
    this.toggleCreateSessionModal();
  }

  confirmNewSession() {
    if (this.newSessionName.trim()) {
      this.sessions.push({ name: this.newSessionName, messages: [] });
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
      this.showErrorToast('You cannot delete the last session.');
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
      messages: []
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

    } else if (this.isWebGroundingEnabled) {
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

      const runConversation = async (isInitialCall = true) => {
        const messagesToSend = isInitialCall
          ? this.messages.filter((m) => m.role !== 'abc')
          : this.messages;

        try {
          const response = await this.client.chat.completions.create({
            messages: [
              ...(this.systemPrompt
                ? [{ role: 'system', content: this.systemPrompt }]
                : []),
              ...messagesToSend,
            ],
            model: this.model,
            temperature: 0.75,
            stream: true,
            tools: isInitialCall ? tools : undefined,
          });

          this.messages = this.messages.filter((m) => m.role !== 'tool');

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
              // console.log('Web grounding tool call:', toolCall);
              if (toolCall.function.name === 'webgroundtool') {

                const args = JSON.parse(toolCall.function.arguments);
                const query = args.query;

                this.messages.push({
                  role: 'tool',
                  content: 'Scraping the web...',
                  tool_call_id: toolCall.id,
                  isToolCallInProgress: true,
                });

                if (query) {
                  const webgroundingResult = await this.webgroundtool(query);

                  this.messages = this.messages.filter(
                    (m) => m.tool_call_id !== toolCall.id
                  );

                  this.messages.push({
                    role: 'tool',
                    content: webgroundingResult,
                    tool_call_id: toolCall.id,
                  });
                  await runConversation(false);
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

    } else {
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


  async webgroundtool(query: string): Promise<string> {
    console.log('webgroundtool called with query:', query);
    return this.webGroundingService.webground(query);
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
      const index = this.selectedLines.indexOf(lineNumber);
      if (index > -1) {
        this.selectedLines.splice(index, 1);
      } else {
        this.selectedLines.push(lineNumber);
      }
      this.selectedLines.sort();
    }
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

        const blockStart = codeBlockLines[0];
        const blockEnd = codeBlockLines[codeBlockLines.length - 1];
        for (let i = blockStart; i <= blockEnd; i++) {
          if (!this.selectedLines.includes(i)) {
            this.selectedLines.push(i);
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

  async copyCode(code: string) {
    try {
      await Clipboard.write({
        string: code
      });
      this.showErrorToast('Code copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy code:', error);
      this.showErrorToast('Failed to copy code. Please try again.');
    }
  }
  showTemplatesAndRefresh() {
    this.showTemplates();
    window.location.reload();
  }
}