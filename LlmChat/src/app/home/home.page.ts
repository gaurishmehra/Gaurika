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