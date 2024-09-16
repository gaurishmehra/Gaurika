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
  model = 'llama3.1-8b';
  customModel = '';
  systemPrompt = '';
  isMultiTurnCotEnabled = false;
  isMultimodalEnabled = false;

  availableApis = [
    { name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1/' },
    { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
    { name: 'Other (Custom)', baseUrl: '' }
  ];
  selectedApi: { name: string; baseUrl: string } = this.availableApis[0];
  customApiBaseUrl: string = '';

  constructor(
    private router: Router,
    private storage: Storage,
    private modalController: ModalController
  ) {}

  async ngOnInit() {
    await this.storage.create();

    this.apiKeys = await this.storage.get('apiKeys') || [];
    this.selectedApiKeyIndex = await this.storage.get('selectedApiKeyIndex') || 0;
    this.model = await this.storage.get('model') || 'llama3.1-8b';
    this.customModel = await this.storage.get('customModel') || '';
    this.systemPrompt = await this.storage.get('systemPrompt') || '';
    this.isMultiTurnCotEnabled = await this.storage.get('isMultiTurnCotEnabled') || false;
    this.isMultimodalEnabled = await this.storage.get('isMultimodalEnabled') || false;

    const storedSelectedApiName = await this.storage.get('selectedApiName');
    const storedCustomApiBaseUrl = await this.storage.get('customApiBaseUrl');

    if (storedSelectedApiName) {
      this.selectedApi = this.availableApis.find(api => api.name === storedSelectedApiName) || this.availableApis[0];
    }

    if (storedCustomApiBaseUrl) {
      this.customApiBaseUrl = storedCustomApiBaseUrl;
      if (this.selectedApi.name === 'Other (Custom)') {
        this.selectedApi.baseUrl = this.customApiBaseUrl;
      }
    }

    // Ensure selectedApiKeyIndex is within bounds
    if (this.selectedApiKeyIndex >= this.apiKeys.length) {
      this.selectedApiKeyIndex = this.apiKeys.length > 0 ? this.apiKeys.length - 1 : 0;
    }

    if (this.model === 'other' && this.customModel !== '') {
      this.model = 'other';
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
    let baseUrlToSave = this.selectedApi.baseUrl;

    if (this.selectedApi.name === 'Other (Custom)') {
      baseUrlToSave = this.customApiBaseUrl;
    }

    await this.storage.set('apiKeys', this.apiKeys);
    await this.storage.set('selectedApiKeyIndex', this.selectedApiKeyIndex);
    await this.storage.set('model', this.model === 'other' ? this.customModel : this.model);
    await this.storage.set('customModel', this.customModel);
    await this.storage.set('systemPrompt', this.systemPrompt);
    await this.storage.set('isMultiTurnCotEnabled', this.isMultiTurnCotEnabled);
    await this.storage.set('isMultimodalEnabled', this.isMultimodalEnabled); 

    await this.storage.set('selectedApiName', this.selectedApi.name);
    await this.storage.set('customApiBaseUrl', this.customApiBaseUrl);
    await this.storage.set('baseUrl', baseUrlToSave);

    window.location.reload();
  }

  getSelectedApiKey(): string | null {
    if (this.apiKeys.length > 0 && this.selectedApiKeyIndex < this.apiKeys.length) {
      return this.apiKeys[this.selectedApiKeyIndex].key;
    } else {
      return null;
    }
  }
}