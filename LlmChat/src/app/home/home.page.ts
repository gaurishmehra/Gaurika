import { Component, OnInit, ViewChild } from '@angular/core';
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

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule, CommonModule],
})
export class HomePage implements OnInit {
  userInput = '';
  messages: { role: string; content: string }[] = [];
  client: any;
  model = 'llama3.1-8b';
  systemPrompt = '';
  sessions: { name: string; messages: { role: string; content: string }[] }[] = [];
  currentSessionIndex = 0;
  currentSessionName = 'Default Session';
  newSessionName = '';
  @ViewChild(IonContent) content!: IonContent;
  isSessionMenuOpen = false;
  isCreateSessionModalOpen = false;
  presentingElement: any;
  isStreaming = false;

  constructor(
    private router: Router,
    private storage: Storage,
    private modalCtrl: ModalController,
    private platform: Platform
  ) {}

  async ngOnInit() {
    await this.storage.create();

    const storedApiKey = await this.storage.get('apiKey');
    const storedModel = await this.storage.get('model');
    const storedSystemPrompt = await this.storage.get('systemPrompt');
    const storedSessions = await this.storage.get('sessions');
    const storedBaseUrl = await this.storage.get('baseUrl');

    if (storedApiKey) {
      this.initializeCerebras(storedApiKey, storedBaseUrl);
    }

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
  }

  initializeCerebras(apiKey: string, baseUrl?: string) {
    this.client = new OpenAI({ 
      apiKey, 
      baseURL: baseUrl || 'https://api.cerebras.ai/',
      dangerouslyAllowBrowser: true,
    });
  }

  async sendMessage() {
    if (!this.client) {
      alert('Please set your API key in settings.');
      return;
    }

    const isMultiTurnCotEnabled = await this.storage.get('isMultiTurnCotEnabled');

    if (isMultiTurnCotEnabled) {
      this.messages.push({ role: 'user', content: this.userInput });
      this.userInput = '';
      this.isStreaming = true;

      let turns = [];
      for (let i = 0; i < 3; i++) { // Example: 3 turns
        const initialSystemPrompt = 
          `You are a highly intelligent AI assistant, adept at logical reasoning and 
problem-solving. Your task is to answer my question in a comprehensive 
and insightful manner, showcasing your ability to think step-by-step.

Here's the structure to follow:

<reasoning>
1. [Clearly state the first step]
   Explanation: [Provide a detailed explanation of this step, 
                 including any relevant background knowledge or logic.]
2. [Clearly state the second step]
   Explanation: [Offer a thorough explanation of this step, 
                 connecting it to the previous step(s) and showing 
                 how it contributes to the solution.]
... [Continue with as many steps as needed]
</reasoning>

<answer>
[Present your final answer here, concisely and clearly derived 
from the step-by-step reasoning process above.]
</answer>

Demonstrate your reasoning skills by making your thought process transparent.`;

        const followupSystemPrompt = 
          `You are an exceptional AI assistant, gifted with analytical skills and 
the ability to improve upon existing solutions. Consider the original 
question and the previous turn's reasoning. 

Your new task is threefold:

<analysis>
<critique>
[Concisely evaluate the strengths and weaknesses of the previous 
reasoning. What was effective? Where could it be improved or expanded?] 
</critique>

<new_reasoning>
1. [State the first step of your revised or enhanced approach]
   Explanation: [Thoroughly explain this step, referring back to the 
                 previous reasoning if necessary. Highlight what's new 
                 or different in your approach.]
2. [State the second step of your refined reasoning]
   Explanation: [Offer a clear explanation, indicating how this step 
                 builds upon, corrects, or deviates from the earlier 
                 reasoning path.]
... [Continue with additional steps as required] 
</new_reasoning>

<answer>
[Present your updated and refined answer based on the analysis and 
new reasoning steps.]
</answer>
</analysis>

Be critical yet constructive. Aim to provide valuable insights and 
a more robust solution.`;

        const systemPrompt = i === 0 ? initialSystemPrompt : followupSystemPrompt;

        const response = await this.client.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            ...this.messages,
          ],
          model: this.model,
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
      }

      // Final Synthesis
      const finalSynthesisPrompt = 
        `You are an expert AI synthesizer, skilled at combining and refining 
multiple lines of thought. You will receive three distinct turns of 
reasoning aimed at solving a problem. Your objective is to synthesize 
them into a final, conclusive answer.

Follow these steps:

<synthesis>
<analysis>
[Provide a concise analysis of each turn of reasoning. Briefly 
summarize its core approach and highlight its main strengths and 
limitations.] 
</analysis>

<comparison>
[Compare and contrast the three turns. What are the key differences 
and similarities in their strategies? Did they arrive at similar 
conclusions through different paths? Which turn offered the most 
insightful or valid points?]
</comparison>

<final_reasoning>
[Based on your analysis and comparison, construct a final, integrated 
line of reasoning. Draw upon the most compelling aspects of each turn 
to create a comprehensive and well-supported argument. Present it in 
a clear step-by-step manner.]
</final_reasoning>

<final_answer>
[Present your final, synthesized answer. This answer should be clear, 
concise, and easily understood by a general audience.] 
</final_answer>
</synthesis>

Your goal is to produce a definitive and insightful answer by 
leveraging the combined knowledge and perspectives of the three 
reasoning turns.`;

      const synthesisResponse = await this.client.chat.completions.create({
        messages: [
          { role: 'system', content: finalSynthesisPrompt },
          ...turns.map((turn, i) => ({
            role: 'assistant',
            content: `Turn ${i + 1}:\n${turn}`,
          })),
        ],
        model: this.model,
        max_tokens: 4096,
      });

      const finalAnswer = synthesisResponse.choices[0].message.content;
      this.messages.push({ role: 'assistant', content: finalAnswer });

      // Save only the final layer's messages
      this.sessions[this.currentSessionIndex].messages = [
        { role: 'user', content: this.userInput }, // Original user message
        { role: 'assistant', content: finalAnswer } 
      ];
      this.storage.set('sessions', this.sessions);

      this.isStreaming = false;
    } else {
      // Existing single-turn logic
      this.messages.push({ role: 'user', content: this.userInput });
      this.userInput = '';
      this.isStreaming = true;

      const response = await this.client.chat.completions.create({
        messages: [
          ...(this.systemPrompt
            ? [{ role: 'system', content: this.systemPrompt }]
            : []),
          ...this.messages,
        ],
        model: this.model,
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
      this.saveCurrentSession();
    }
  }

  openSettings() {
    this.router.navigate(['/settings']);
  }

  toggleSessionMenu() {
    this.isSessionMenuOpen = !this.isSessionMenuOpen;
  }

  toggleCreateSessionModal() {
    this.isCreateSessionModalOpen = !this.isCreateSessionModalOpen;
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
}