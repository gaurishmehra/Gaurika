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
  AlertController
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SettingsService } from '../services/settings.service'; // Import the service

interface Message {
  role: string;
  content: string;
  image?: string | null;
  tool_call_id?: string;
  isToolCallInProgress?: boolean;
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
  sessions: { name: string; messages: Message[] }[] = [];
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
  showTemplatesPage = true;
  abortController: AbortController | null = null;
  isStreamStopped = false;

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
    private settingsService: SettingsService // Inject the service
  ) {}

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
      StatusBar.setBackgroundColor({ color: '#0a0a0a' });
    }

    const storedApiKey = await this.storage.get('apiKey');
    const storedBaseUrl = await this.storage.get('baseUrl');

    if (storedApiKey && storedBaseUrl) {
      this.initializesdk(storedApiKey, storedBaseUrl);
    } else {
      console.warn('API Key or base URL not found in storage. Initializing with default values.');
      await this.initializeOpenAIClient();
    }

    // Check if it's the first time visit
    const hasShownFirstTimeMessage = await this.storage.get('hasShownFirstTimeMessage');
    if (!hasShownFirstTimeMessage) {
      await this.showFirstTimeToast();
      await this.storage.set('hasShownFirstTimeMessage', true);
    }
  }

  async showFirstTimeToast() {
    const alert = await this.alertController.create({
      header: 'Welcome!',
      message: "If you're using this for the first time, please review the settings and click 'Save Settings' at the bottom to apply the default configuration. Advanced users can add custom OpenAI-compatible base URLs and endpoints in the advanced settings menu. Note: web grounding and some features are still in development.",
      buttons: [
        {
          text: 'OK',
          handler: () => {
            this.settingsService.saveDefaultSettings();// Pass the function as navigation parameter
          }
        }
      ]
    });

    await alert.present();
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
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.selectedImage = await this.readFileAsDataURL(file);
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

  removeSelectedImage() {
    this.selectedImage = null;
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

  openSettings() {
    this.router.navigate(['/settings']);
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
      alert('You cannot delete the last session.');
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
    this.messages.splice(index, 1);
    this.saveCurrentSession();
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

          this.messages.splice(lastUserMessageIndex, 2);

          this.userInput = lastUserMessageContent;
          this.selectedImage = lastUserMessageImage || null;

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
    if (messageContent === '') return;

    if (this.showTemplatesPage || this.sessions.length === 0) {
      await this.createNewSessionFromMessage(messageContent);
    }

    this.isStreaming = true;
    this.isStreamStopped = false;

    let imageContent = this.selectedImage;

    if (this.isMultimodalEnabled) {
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
          console.error('Error in web grounding:', error);
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
        } else {
          console.error('Error calling OpenAI API:', error);
          await this.showErrorToast('Sorry, I encountered an error processing your request.');
        }
      } finally {
        this.abortController = null;
      }
    }

    this.userInput = '';
    this.selectedImage = null;
    this.saveCurrentSession();
    this.isStreaming = false;
    this.content.scrollToBottom(300);
  }

  async webgroundtool(query: string): Promise<string> {
    console.log('webgroundtool called with query:', query);
    return `sam altman is gay`;
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

  triggerImageUpload() {
    this.fileInput.nativeElement.click();
  }
}