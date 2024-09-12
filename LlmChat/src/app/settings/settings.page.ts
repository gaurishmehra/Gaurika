import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Storage } from '@ionic/storage-angular';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule, CommonModule]
})
export class SettingsPage implements OnInit {
  apiKey = '';
  model = 'llama3.1-8b';
  customModel = ''; // To store custom model name
  systemPrompt = '';
  baseUrl = "https://api.cerebras.ai/"; // Default base URL
  customBaseUrl = '';

  constructor(private router: Router, private storage: Storage) {}

  async ngOnInit() {
    await this.storage.create();

    const storedApiKey = await this.storage.get('apiKey');
    const storedModel = await this.storage.get('model');
    const storedSystemPrompt = await this.storage.get('systemPrompt');
    const storedBaseUrl = await this.storage.get('baseUrl');

    if (storedApiKey) {
      this.apiKey = storedApiKey;
    }

    if (storedModel) {
      this.model = storedModel;
    }

    if (storedSystemPrompt) {
      this.systemPrompt = storedSystemPrompt;
    }

    if (storedBaseUrl) {
      this.baseUrl = storedBaseUrl;
    }
  }

  async saveSettings() {
    const modelToSave = this.model === 'other' ? this.customModel : this.model;
    const baseUrlToSave = this.baseUrl === 'other' ? this.customBaseUrl : this.baseUrl;

    await this.storage.set('apiKey', this.apiKey);
    await this.storage.set('model', modelToSave); // Store selected or custom model
    await this.storage.set('systemPrompt', this.systemPrompt);
    await this.storage.set('baseUrl', baseUrlToSave); 

    window.location.reload(); 
  }
}