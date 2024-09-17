import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Storage } from '@ionic/storage-angular';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { AddApiKeyModalComponent } from '../add-api-key-modal/add-api-key-modal.component';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule, CommonModule]
})
export class SettingsPage implements OnInit {
  apiKeys: { name: string, key: string }[] = [];
  selectedApiKeyIndex: number = 0;

  apiProviders: { name: string, baseUrl: string }[] = [
    { name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1/' },
    { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
    { name: 'SambaNova', baseUrl: 'https://fast-api.snova.ai/v1/' },
    { name: 'Other (Custom)', baseUrl: '' }
  ];
  selectedApiProviderIndex: number = 0;
  customApiBaseUrl: string = '';

  models: { name: string, value: string }[] = [
    { name: 'llama3.1-8b (Cerebras)', value: 'llama3.1-8b' },
    { name: 'llama3.1-70b (Cerebras)', value: 'llama3.1-70b' },
    { name: 'llama3.1-70b (Groq)', value: 'llama-3.1-70b-versatile' },
    { name: 'llama3.1-8b (Groq)', value: 'llama-3.1-8b-instant' },
    { name: 'llama3.1-405b (SambaNova)', value: 'Meta-Llama-3.1-405B-Instruct-8k' },
    { name: 'Other (Custom)', value: 'other' }
  ];
  selectedModelIndex: number = 0;
  customModel: string = '';

  systemPrompt = '';
  isMultiTurnCotEnabled = false;
  isMultimodalEnabled = false;

  constructor(
    private router: Router,
    private storage: Storage,
    private modalController: ModalController
  ) {}

  async ngOnInit() {
    await this.storage.create();

    this.apiKeys = await this.storage.get('apiKeys') || [];
    this.selectedApiKeyIndex = await this.storage.get('selectedApiKeyIndex') || 0;

    this.selectedApiProviderIndex = await this.storage.get('selectedApiProviderIndex') || 0;
    this.customApiBaseUrl = await this.storage.get('customApiBaseUrl') || '';

    this.selectedModelIndex = await this.storage.get('selectedModelIndex') || 0;
    this.customModel = await this.storage.get('customModel') || '';

    this.systemPrompt = await this.storage.get('systemPrompt') || '';
    this.isMultiTurnCotEnabled = await this.storage.get('isMultiTurnCotEnabled') || false;
    this.isMultimodalEnabled = await this.storage.get('isMultimodalEnabled') || false;

    // Ensure selectedApiKeyIndex is within bounds
    if (this.selectedApiKeyIndex >= this.apiKeys.length) {
      this.selectedApiKeyIndex = this.apiKeys.length > 0 ? this.apiKeys.length - 1 : 0;
    }

    // Ensure selectedApiProviderIndex is within bounds
    if (this.selectedApiProviderIndex >= this.apiProviders.length) {
      this.selectedApiProviderIndex = this.apiProviders.length > 0 ? this.apiProviders.length - 1 : 0;
    }

    // Ensure selectedModelIndex is within bounds
    if (this.selectedModelIndex >= this.models.length) {
      this.selectedModelIndex = this.models.length > 0 ? this.models.length - 1 : 0;
    }

    if (this.getSelectedModelValue() === 'other' && this.customModel !== '') {
      this.selectedModelIndex = this.models.length - 1; // Select "Other (Custom)"
    }
  }

  async showAddApiKeyModal() {
    const modal = await this.modalController.create({
      component: AddApiKeyModalComponent,
    });

    modal.onDidDismiss().then((data) => {
      if (data.data && data.data.name && data.data.key) {
        this.apiKeys.push(data.data);
        this.saveSettings();
      }
    });

    return await modal.present();
  }

  async editApiKey(index: number) {
    const modal = await this.modalController.create({
      component: AddApiKeyModalComponent,
      componentProps: {
        apiKey: this.apiKeys[index],
        index: index
      }
    });

    modal.onDidDismiss().then((data) => {
      if (data.data && data.data.name && data.data.key) {
        this.apiKeys[index] = data.data;
        this.saveSettings();
      }
    });

    return await modal.present();
  }

  removeApiKey(index: number) {
    this.apiKeys.splice(index, 1);
    if (this.selectedApiKeyIndex === index) {
      this.selectedApiKeyIndex = this.apiKeys.length > 0 ? 0 : 0;
    }
    this.saveSettings();
  }

  async saveSettings() {
    let baseUrlToSave = this.getSelectedApiProviderBaseUrl();

    if (this.getSelectedApiProviderName() === 'Other (Custom)') {
      baseUrlToSave = this.customApiBaseUrl;
    }

    await this.storage.set('apiKeys', this.apiKeys);
    await this.storage.set('selectedApiKeyIndex', this.selectedApiKeyIndex);

    await this.storage.set('selectedApiProviderIndex', this.selectedApiProviderIndex);
    await this.storage.set('customApiBaseUrl', this.customApiBaseUrl);

    await this.storage.set('selectedModelIndex', this.selectedModelIndex);
    await this.storage.set('customModel', this.customModel);

    await this.storage.set('systemPrompt', this.systemPrompt);
    await this.storage.set('isMultiTurnCotEnabled', this.isMultiTurnCotEnabled);
    await this.storage.set('isMultimodalEnabled', this.isMultimodalEnabled);

    await this.storage.set('baseUrl', baseUrlToSave);
    await this.storage.set('model', this.getSelectedModelValue()); // Save the selected model value

    window.location.reload();
  }

  getSelectedApiKey(): string | null {
    if (this.apiKeys.length > 0 && this.selectedApiKeyIndex < this.apiKeys.length) {
      return this.apiKeys[this.selectedApiKeyIndex].key;
    } else {
      return null;
    }
  }

  getSelectedApiProviderName(): string {
    return this.apiProviders[this.selectedApiProviderIndex].name;
  }

  getSelectedApiProviderBaseUrl(): string {
    return this.apiProviders[this.selectedApiProviderIndex].baseUrl;
  }

  getSelectedModelName(): string {
    return this.models[this.selectedModelIndex].name;
  }

  getSelectedModelValue(): string {
    if (this.selectedModelIndex === this.models.length - 1 && this.customModel !== '') { // "Other (Custom)"
      return this.customModel; 
    } else {
      return this.models[this.selectedModelIndex].value;
    }
  }
}