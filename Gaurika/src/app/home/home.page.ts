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
  tool_call_id?: string;
  isToolCallInProgress?: boolean;
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
  isSingleTurnCotEnabled = false;
  isMultimodalEnabled = false;
  isWebGroundingEnabled = false;
  selectedImage: string | null = null;
  showTemplatesPage = true;

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
      name: 'Problem Solving',
      prompt: 'Explain how to solve a Rubik\'s Cube step-by-step.',
    },
  ];

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
             [Present your final answer here, concisely and clearly derived from the step-by-step reasoning process above.]`,
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
    contextVariables: { previousReasoning: '' },
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
    contextVariables: { turn1: '', turn2: '', turn3: '' },
  };

  initialSingleTurnPrompt: PromptModule = {
    role: 'system',
    content: `You are an AI assistant with exceptional analytical capabilities and a commitment to accuracy. Follow this precise structure:

    1. INITIAL BRAINSTORMING (200-300 words):
    Generate diverse ideas related to the question. Include conventional wisdom, expert opinions, and relevant facts. Prioritize accuracy but don't filter out unconventional thoughts.

    2. INITIAL REASONING (400-500 words):
    Develop a logical, fact-based argument to answer the question. Use credible information and sound logic. Present in numbered steps:
    Step 1: [Statement based on verified information]
        Explanation: [Detailed reasoning with supporting evidence]
    Step 2: [Statement building on previous step]
        Explanation: [Detailed reasoning with additional facts or expert insights]
    [Continue for at least 5 steps, ensuring each step is logically sound and factually accurate]

    3. CRITICAL ANALYSIS AND ALTERNATIVE APPROACH (500-600 words):
    Rigorously examine your initial reasoning for potential flaws or oversights. Then, construct an alternative approach that:
    a) Addresses any weaknesses in the initial reasoning
    b) Considers the problem from a different, yet equally valid perspective
    c) Incorporates any overlooked facts or alternative interpretations of data
    Present this new reasoning in numbered steps:
    Step 1: [Statement presenting a different, factually-supported viewpoint]
        Explanation: [Detailed justification using credible information]
    Step 2: [Statement building on the new approach]
        Explanation: [Detailed reasoning with additional evidence]
    [Continue for at least 6 steps, ensuring each step is logical and based on accurate information]

    4. INITIAL ANSWER (100-150 words):
    Based on your alternative approach, provide a clear, accurate answer to the question. Ensure it's supported by the facts and logic presented in your revised reasoning.

    5. FINAL, COMPREHENSIVE, AND CORRECT ANSWER (200-250 words):
    Formulate a final answer that MUST:
    a) Synthesize the most accurate elements from both reasoning processes
    b) Be more comprehensive and precise than the initial answer
    c) Address any remaining uncertainties or potential objections
    d) Be firmly grounded in factual information and sound logic

    Throughout this process, prioritize accuracy and logical consistency. If at any point you realize you've made an error or have access to conflicting information, acknowledge it explicitly and correct your reasoning before moving to the next step.`,
  };

  constructor(
    private router: Router,
    private storage: Storage,
    private modalCtrl: ModalController,
    private platform: Platform
  ) {}

  async ngOnInit() {
    await this.storage.create();

    const storedModel = await this.storage.get('model');
    const storedSystemPrompt = await this.storage.get('systemPrompt');
    const storedSessions = await this.storage.get('sessions');
    this.isMultiTurnCotEnabled =
      (await this.storage.get('isMultiTurnCotEnabled')) || false;
    this.isSingleTurnCotEnabled =
      (await this.storage.get('isSingleTurnCotEnabled')) || false;
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
      StatusBar.setBackgroundColor({ color: '#141414' });
    }

    await this.initializeOpenAIClient();
  }

  async initializeOpenAIClient() {
    const storedApiKeys = (await this.storage.get('apiKeys')) || [];
    const selectedApiKeyIndex =
      (await this.storage.get('selectedApiKeyIndex')) || 0;
    const storedBaseUrl = await this.storage.get('baseUrl');

    if (
      storedApiKeys.length > 0 &&
      selectedApiKeyIndex < storedApiKeys.length
    ) {
      const selectedApiKey = storedApiKeys[selectedApiKeyIndex].key;

      if (storedBaseUrl) {
        this.initializesdk(selectedApiKey, storedBaseUrl);
      } else {
        console.warn('No API Base URL found in storage. Using default.');
        this.initializesdk(selectedApiKey);
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
        alert(
          'API client not initialized. Please check your API key settings.'
        );
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
          model: this.model,
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

        if (
          i > 0 &&
          this.calculateCosineSimilarity(turns[i - 1], turns[i]) > 0.8
        ) {
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
    } else if (this.isSingleTurnCotEnabled) {
      this.messages.push({ role: 'user', content: messageContent });
      this.isStreaming = true;

      const response = await this.client.chat.completions.create({
        messages: [this.initialSingleTurnPrompt, ...this.messages],
        model: this.model,
        temperature: 0.5,
        top_p: 1,
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
    } else if (this.isWebGroundingEnabled) {
      this.messages.push({ role: 'user', content: messageContent });
      this.isStreaming = true;

      const tools = [
        {
          type: 'function',
          function: {
            name: 'webgroundtool',
            description:
              "Use this tool to search the web for factual information related to the user's request.",
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

          setTimeout(() => {
            this.content.scrollToBottom(300);
          });
        }
      };

      await runConversation();
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

  replaceContextVariables(
    text: string,
    variables: { [key: string]: string }
  ): string {
    for (const key in variables) {
      text = text.replace(`{{${key}}}`, variables[key]);
    }
    return text;
  }

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

  async webgroundtool(query: string): Promise<string> {
    console.log('webgroundtool called with query:', query);
    return `sam altman is gay`;
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

  async startConversation(template: { name: string; prompt: string }) {
    this.showTemplatesPage = false;
    this.sessions.push({
      name: template.name,
      messages: [{ role: 'user', content: template.prompt }],
    });
    this.currentSessionIndex = this.sessions.length - 1;
    this.loadCurrentSession();
    this.saveCurrentSession();

    await this.sendMessage();
  }

  getIconForTemplate(templateName: string): string {
    switch (templateName) {
      case 'Creative Writing':
        return 'create-outline';
      case 'Code Generation':
        return 'code-slash-outline';
      case 'Problem Solving':
        return 'bulb-outline';
      default:
        return 'chatbubbles-outline';
    }
  }
}