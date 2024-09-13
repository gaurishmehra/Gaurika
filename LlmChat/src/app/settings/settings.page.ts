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
  apiKeys: string[] = [];
  newApiKey: string = '';
  selectedApiKey: string | null = null;
  model = 'llama3.1-8b';
  customModel = '';
  systemPrompt = '';

  availableApis = [
    { name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1/' },
    { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
    { name: 'Other (Custom)', baseUrl: '' } // Custom option (empty baseUrl)
  ];
  selectedApi: { name: string; baseUrl: string } = this.availableApis[0]; // Initialize with the first API
  customApiBaseUrl: string = '';

  constructor(private router: Router, private storage: Storage) {}

  async ngOnInit() {
    await this.storage.create();

    this.apiKeys = await this.storage.get('apiKeys') || [];
    this.selectedApiKey = await this.storage.get('selectedApiKey');
    this.model = await this.storage.get('model') || 'llama3.1-8b';
    this.customModel = await this.storage.get('customModel') || '';
    this.systemPrompt = await this.storage.get('systemPrompt') || '';

    // Load selected API and custom URL
    const storedSelectedApiName = await this.storage.get('selectedApiName');
    const storedCustomApiBaseUrl = await this.storage.get('customApiBaseUrl');

    if (storedSelectedApiName) {
      this.selectedApi = this.availableApis.find(api => api.name === storedSelectedApiName) || this.availableApis[0];
    }

    if (storedCustomApiBaseUrl) {
      this.customApiBaseUrl = storedCustomApiBaseUrl;
      if (this.selectedApi.name === 'Other (Custom)') {
        this.selectedApi.baseUrl = this.customApiBaseUrl; // Update baseUrl if custom is selected
      }
    }

    if (this.selectedApiKey === null && this.apiKeys.length > 0) {
      this.selectedApiKey = this.apiKeys[0];
    }

    if (this.model === 'other' && this.customModel !== '') {
      this.model = 'other'; 
    }
  }

  addApiKey() {
    if (this.newApiKey.trim() !== '') {
      this.apiKeys.push(this.newApiKey);
      this.newApiKey = '';
      this.saveSettings();
    }
  }

  removeApiKey(index: number) {
    this.apiKeys.splice(index, 1);
    if (this.selectedApiKey === this.apiKeys[index]) {
      this.selectedApiKey = this.apiKeys.length > 0 ? this.apiKeys[0] : null;
    }
    this.saveSettings();
  }

  async saveSettings() {
    let baseUrlToSave = this.selectedApi.baseUrl;

    if (this.selectedApi.name === 'Other (Custom)') {
      baseUrlToSave = this.customApiBaseUrl;
    }

    await this.storage.set('apiKeys', this.apiKeys);
    await this.storage.set('selectedApiKey', this.selectedApiKey);
    await this.storage.set('model', this.model === 'other' ? this.customModel : this.model);
    await this.storage.set('customModel', this.customModel);
    await this.storage.set('systemPrompt', this.systemPrompt);

    // Save selected API name and custom URL
    await this.storage.set('selectedApiName', this.selectedApi.name);
    await this.storage.set('customApiBaseUrl', this.customApiBaseUrl);
    await this.storage.set('baseUrl', baseUrlToSave); 

    window.location.reload();
  }
}