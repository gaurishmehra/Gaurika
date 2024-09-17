import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import OpenAI from 'openai';
import { Storage } from '@ionic/storage-angular';
import {
  ModalController,
  IonContent,
  Platform,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { StatusBar, Style } from '@capacitor/status-bar';

interface Message {
  role: string;
  content: string;
  image?: string;
}

interface PromptModule {
  role: string;
  content: string;
  contextVariables?: { [key: string]: string };
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
  model = 'llama3.1-8b';
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
  isMultiTurnCotEnabled = false;
  isMultimodalEnabled = false;
  selectedImage: string | null = null;

  initialPrompt: PromptModule = {
    role: 'system',
    content: `You are a highly intelligent AI assistant, adept at logical reasoning and problem-solving. 
             Your task is to answer the user's question in a comprehensive and insightful manner, 
             showcasing your ability to think step-by-step. Please follow this structure: 

             ## Reasoning:
             1. [Clearly state the first step]
                Explanation: [Provide a detailed explanation of this step, including relevant background knowledge or logic.]
             2. [Clearly state the second step]
                Explanation: [Offer a thorough explanation of this step, connecting it to the previous step(s) and showing how it contributes to the solution.]
             ... [Continue with as many steps as needed]

             ## Answer:
             [Present your final answer here, concisely and clearly derived from the step-by-step reasoning process above.]`
  };

  followupPrompt: PromptModule = {
    role: 'system',
    content: `You are an exceptional AI assistant, gifted with analytical skills and the ability to improve 
             upon existing solutions. Consider the original question and the previous turn's reasoning, 
             which is provided below.

             ## Previous Reasoning:
             {{previousReasoning}} 

             Your new task is threefold:

             ## Analysis:
             ### Critique:
             [Concisely evaluate the strengths and weaknesses of the previous reasoning. What was effective? 
              Where could it be improved or expanded?] 

             ### New Reasoning:
             1. [State the first step of your revised or enhanced approach]
                Explanation: [Thoroughly explain this step, referring back to the previous reasoning if necessary. 
                             Highlight what's new or different in your approach.]
             2. [State the second step of your refined reasoning]
                Explanation: [Offer a clear explanation, indicating how this step builds upon, corrects, or deviates 
                             from the earlier reasoning path.]
             ... [Continue with additional steps as required] 

             ## Answer:
             [Present your updated and refined answer based on the analysis and new reasoning steps.]`,
    contextVariables: { previousReasoning: '' }
  };

  synthesisPrompt: PromptModule = {
    role: 'system',
    content: `You are an expert AI synthesizer, skilled at combining and refining multiple lines of thought. 
             You will receive three distinct turns of reasoning aimed at solving a problem. Your objective 
             is to synthesize them into a final, conclusive answer.

             ## Turns of Reasoning:
             {{turn1}}
             {{turn2}}
             {{turn3}}

             Follow these steps:

             ## Synthesis:
             ### Analysis:
             [Provide a concise analysis of each turn of reasoning. Briefly summarize its core approach and 
              highlight its main strengths and limitations.] 

             ### Comparison:
             [Compare and contrast the three turns. What are the key differences and similarities in their 
              strategies? Did they arrive at similar conclusions through different paths? Which turn offered 
              the most insightful or valid points?]

             ### Final Reasoning:
             [Based on your analysis and comparison, construct a final, integrated line of reasoning. Draw upon 
              the most compelling aspects of each turn to create a comprehensive and well-supported argument. 
              Present it in a clear step-by-step manner.]

             ## Final Answer:
             [Present your final, synthesized answer. This answer should be clear, concise, and easily 
              understood by a general audience.]`,
    contextVariables: { turn1: '', turn2: '', turn3: '' }
  };

  constructor(
    private router: Router,
    private storage: Storage,
    private modalCtrl: ModalController,
    private platform: Platform
  ) {}

  async ngOnInit() {
    await this.storage.create();

    // Retrieve stored settings
    const storedModel = await this.storage.get('model');
    const storedSystemPrompt = await this.storage.get('systemPrompt');
    const storedSessions = await this.storage.get('sessions');
    this.isMultiTurnCotEnabled = await this.storage.get('isMultiTurnCotEnabled') || false;
    this.isMultimodalEnabled = await this.storage.get('isMultimodalEnabled') || false;

    if (storedModel) {
      this.model = storedModel;
    }

    if (storedSystemPrompt) {
      this.systemPrompt = storedSystemPrompt;
    }

    if (storedSessions) {
      this.sessions = storedSessions;
    } else {
      this.sessions.push({ name: 'Default Session', messages: [] });
    }

    this.loadCurrentSession();
    this.presentingElement = document.querySelector('.ion-page');

    if (this.platform.is('android')) {
      StatusBar.setStyle({ style: Style.Dark });
      StatusBar.setBackgroundColor({ color: '#0a0a0a' });
    }

    await this.initializeOpenAIClient();
  }

  async initializeOpenAIClient() {
    const storedApiKeys = await this.storage.get('apiKeys') || [];
    const selectedApiKeyIndex = await this.storage.get('selectedApiKeyIndex') || 0;
    const storedBaseUrl = await this.storage.get('baseUrl');

    if (storedApiKeys.length > 0 && selectedApiKeyIndex < storedApiKeys.length) {
      const selectedApiKey = storedApiKeys[selectedApiKeyIndex].key;

      if (storedBaseUrl) {
        this.initializesdk(selectedApiKey, storedBaseUrl);
      } else {
        console.warn("No API Base URL found in storage. Using default.");
        this.initializesdk(selectedApiKey); // Use default if not found
      }
    } else {
      console.warn(
        'No API key selected. Please configure an API key in settings.'
      );
    }
  }

  initializesdk(apiKey: string, baseUrl?: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl || 'https://api.cerebras.ai/',
      dangerouslyAllowBrowser: true,
    });
  }

  async sendMessage() {
    if (!this.client) {
      await this.initializeOpenAIClient();
      if (!this.client) {
        alert('API client not initialized. Please check your API key settings.');
        return;
      }
    }

    let messageContent = this.userInput;
    let imageContent = this.selectedImage;

    if (this.isMultimodalEnabled && imageContent) {
      const base64Image = await this.getBase64Image(imageContent);
      this.messages.push({
        role: 'user',
        content: messageContent,
        image: imageContent,
      });

      const apiMessage = [
        { type: 'text', text: messageContent },
        {
          type: 'image_url',
          image_url: {
            url: base64Image,
          },
        },
      ];

      try {
        const response = await this.client.chat.completions.create({
          model: 'mistralai/pixtral-12b:free',
          messages: [{ role: 'user', content: apiMessage }],
          max_tokens: 300,
        });

        this.messages.push({
          role: 'assistant',
          content: response.choices[0].message.content,
        });
      } catch (error) {
        console.error('Error calling OpenAI API:', error);
        this.messages.push({
          role: 'assistant',
          content: 'Sorry, I encountered an error processing your image.',
        });
      }
    } else if (this.isMultiTurnCotEnabled) {
      this.messages.push({ role: 'user', content: messageContent });
      this.isStreaming = true;

      let turns = [];
      let currentPrompt = this.initialPrompt;

      for (let i = 0; i < 5; i++) {
        let promptToSend = { ...currentPrompt };
        if (currentPrompt.contextVariables) {
          promptToSend.content = this.replaceContextVariables(
            promptToSend.content,
            currentPrompt.contextVariables
          );
        }

        const response = await this.client.chat.completions.create({
          messages: [promptToSend, ...this.messages],
          model: this.model,
          temperature: 0.25,
          stream: true,
        });

        let assistantMessage = { role: 'assistant', content: '' };
        this.messages.push(assistantMessage);

        for await (const part of response) {
          if (part.choices[0].delta?.content) {
            assistantMessage.content += part.choices[0].delta.content;
          }

          setTimeout(() => {
            this.content.scrollToBottom(300);
          });
        }

        turns.push(assistantMessage.content);

        if (i > 0 && this.calculateCosineSimilarity(turns[i - 1], turns[i]) > 0.8) {
          break;
        }

        currentPrompt = this.followupPrompt;
        currentPrompt.contextVariables!['previousReasoning'] =
          assistantMessage.content;
      }

      let synthesisPromptToSend = { ...this.synthesisPrompt };
      synthesisPromptToSend.contextVariables!['turn1'] = turns[0];
      synthesisPromptToSend.contextVariables!['turn2'] = turns[1];
      synthesisPromptToSend.contextVariables!['turn3'] = turns[2];

      synthesisPromptToSend.content = this.replaceContextVariables(
        synthesisPromptToSend.content,
        synthesisPromptToSend.contextVariables!
      );

      const synthesisResponse = await this.client.chat.completions.create({
        messages: [synthesisPromptToSend],
        model: this.model,
        temperature: 0.5,
        max_tokens: 4096,
      });

      const finalAnswer = synthesisResponse.choices[0].message.content;
      this.messages.push({ role: 'assistant', content: finalAnswer });

      this.isStreaming = false;
    } else {
      this.messages.push({ role: 'user', content: messageContent });
      this.isStreaming = true;

      const response = await this.client.chat.completions.create({
        messages: [
          ...(this.systemPrompt
            ? [{ role: 'system', content: this.systemPrompt }]
            : []),
          ...this.messages,
        ],
        model: this.model,
        temperature: 0.75,
        stream: true,
      });

      let assistantMessage = { role: 'assistant', content: '' };
      this.messages.push(assistantMessage);

      for await (const part of response) {
        if (part.choices[0].delta?.content) {
          assistantMessage.content += part.choices[0].delta.content;
        }

        setTimeout(() => {
          this.content.scrollToBottom(300);
        });
      }

      this.isStreaming = false;
    }

    this.userInput = '';
    this.selectedImage = null;
    this.saveCurrentSession();
    setTimeout(() => {
      this.content.scrollToBottom(300);
    });
  }

  triggerImageUpload() {
    this.fileInput.nativeElement.click();
  }

  async onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.selectedImage = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  removeSelectedImage() {
    this.selectedImage = null;
  }

  async getBase64Image(imgUrl: string): Promise<string> {
    if (imgUrl.startsWith('data:image')) {
      return imgUrl;
    }

    const response = await fetch(imgUrl);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  openSettings() {
    this.router.navigate(['/settings']);
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

  /**
   * Replaces context variables in a string with their corresponding values.
   *
   * @param text The string containing the context variables.
   * @param variables An object mapping context variable names to their values.
   * @returns The string with the context variables replaced.
   */
  replaceContextVariables(
    text: string,
    variables: { [key: string]: string }
  ): string {
    for (const key in variables) {
      text = text.replace(`{{${key}}}`, variables[key]);
    }
    return text;
  }

  /**
   * Calculates the cosine similarity between two strings.
   *
   * @param str1 The first string.
   * @param str2 The second string.
   * @returns The cosine similarity between the two strings, a value between 0 and 1.
   */
  calculateCosineSimilarity(str1: string, str2: string): number {
    const words1 = str1.toLowerCase().split(/\s+/);
    const words2 = str2.toLowerCase().split(/\s+/);

    const wordCounts1: { [word: string]: number } = {};
    const wordCounts2: { [word: string]: number } = {};

    for (const word of words1) {
      wordCounts1[word] = (wordCounts1[word] || 0) + 1;
    }
    for (const word of words2) {
      wordCounts2[word] = (wordCounts2[word] || 0) + 1;
    }

    const allWords = new Set([...words1, ...words2]);
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    for (const word of allWords) {
      const count1 = wordCounts1[word] || 0;
      const count2 = wordCounts2[word] || 0;
      dotProduct += count1 * count2;
      magnitude1 += count1 * count1;
      magnitude2 += count2 * count2;
    }

    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(magnitude1) * Math.sqrt(magnitude2));
  }
}