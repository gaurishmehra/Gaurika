import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Storage } from '@ionic/storage-angular';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { AddApiKeyModalComponent } from '../add-api-key-modal/add-api-key-modal.component';
import { AddApiProviderModalComponent } from '../add-api-provider-modal/add-api-provider-modal.component';
import { AddModelModalComponent } from '../add-model-modal/add-model-modal.component';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule, CommonModule],
})
export class SettingsPage implements OnInit {
  apiKeys: { name: string; key: string }[] = [];
  selectedApiKeyIndex: number = 0;

  apiProviders: { name: string; baseUrl?: string }[] = [];
  selectedApiProviderIndex: number = 0;

  models: {
    name: string;
    value: string;
    apiKeyIndex?: number;
    apiProviderIndex?: number;
    isMultimodal?: boolean;
  }[] = [];
  selectedModelIndex: number = 0;

  systemPrompt = 'You are a helpful assistant named Gaurika, Made by Gaurish Mehra.. You are much more than a simple llm, the default model is llama3.1-70b, but the user may change it.';
  isMultiTurnCotEnabled = false;
  isSingleTurnCotEnabled = false;
  isWebGroundingEnabled = false;
  isMultimodalEnabled = false;

  showAdvancedSettings = false;

  constructor(
    private router: Router,
    private storage: Storage,
    private modalController: ModalController
  ) {}

  async ngOnInit() {
    await this.storage.create();

    this.apiKeys = (await this.storage.get('apiKeys')) || [];
    this.selectedApiKeyIndex = (await this.storage.get('selectedApiKeyIndex')) || 0;

    this.apiProviders = (await this.storage.get('apiProviders')) || [];
    this.selectedApiProviderIndex = (await this.storage.get('selectedApiProviderIndex')) || 0;

    this.models = (await this.storage.get('models')) || [];
    this.selectedModelIndex = (await this.storage.get('selectedModelIndex')) || 0;

    this.systemPrompt = (await this.storage.get('systemPrompt')) || '';
    this.isMultiTurnCotEnabled = (await this.storage.get('isMultiTurnCotEnabled')) || false;
    this.isSingleTurnCotEnabled = (await this.storage.get('isSingleTurnCotEnabled')) || false;
    this.isWebGroundingEnabled = (await this.storage.get('isWebGroundingEnabled')) || false;
    this.isMultimodalEnabled = (await this.storage.get('isMultimodalEnabled')) || false;

    this.ensureSelectedIndicesWithinBounds();
    this.onModelChange();

    // Add default entries if they don't exist
    this.addDefaultEntriesIfNotPresent();
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
        index: index,
      },
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

    this.models.forEach(model => {
      if (model.apiKeyIndex === index) {
        delete model.apiKeyIndex;
      } else if (model.apiKeyIndex !== undefined && model.apiKeyIndex > index) {
        model.apiKeyIndex--;
      }
    });

    this.saveSettings();
  }

  async showAddApiProviderModal() {
    const modal = await this.modalController.create({
      component: AddApiProviderModalComponent,
    });

    modal.onDidDismiss().then((data) => {
      if (data.data && data.data.name && data.data.baseUrl) {
        this.apiProviders.push(data.data);
        this.saveSettings();
      }
    });

    return await modal.present();
  }

  async editApiProvider(index: number) {
    const modal = await this.modalController.create({
      component: AddApiProviderModalComponent,
      componentProps: {
        apiProvider: this.apiProviders[index],
        index: index,
      },
    });

    modal.onDidDismiss().then((data) => {
      if (data.data && data.data.name && data.data.baseUrl) {
        this.apiProviders[index] = data.data;
        this.saveSettings();
      }
    });

    return await modal.present();
  }

  removeApiProvider(index: number) {
    this.apiProviders.splice(index, 1);
    if (this.selectedApiProviderIndex === index) {
      this.selectedApiProviderIndex = this.apiProviders.length > 0 ? 0 : 0;
    }

    this.models.forEach(model => {
      if (model.apiProviderIndex === index) {
        delete model.apiProviderIndex;
      } else if (model.apiProviderIndex !== undefined && model.apiProviderIndex > index) {
        model.apiProviderIndex--;
      }
    });

    this.saveSettings();
  }

  async showAddModelModal() {
    const modal = await this.modalController.create({
      component: AddModelModalComponent,
      componentProps: {
        apiKeys: this.apiKeys,
        apiProviders: this.apiProviders,
        selectedApiKeyIndex: this.selectedApiKeyIndex,
        selectedApiProviderIndex: this.selectedApiProviderIndex,
        models: this.models,
        selectedModelIndex: this.selectedModelIndex,
      }
    });

    modal.onDidDismiss().then((data) => {
      if (
        data.data.data &&
        data.data.data.name &&
        data.data.data.value &&
        data.data.data.apiKeyIndex !== undefined &&
        data.data.data.apiProviderIndex !== undefined
      ) {
        this.models.push(data.data.data);
        this.saveSettings();
      }
    });

    return await modal.present();
  }

  async editModel(index: number) {
    const modal = await this.modalController.create({
      component: AddModelModalComponent,
      componentProps: {
        model: this.models[index],
        index: index,
        apiKeys: this.apiKeys,
        apiProviders: this.apiProviders,
      },
    });

    modal.onDidDismiss().then((data) => {
      if (data.data && data.data.name && data.data.value && data.data.apiKeyIndex !== undefined && data.data.apiProviderIndex !== undefined) {
        this.models[index] = data.data;
        this.saveSettings();
      }
    });

    return await modal.present();
  }

  removeModel(index: number) {
    this.models.splice(index, 1);
    if (this.selectedModelIndex === index) {
      this.selectedModelIndex = this.models.length > 0 ? 0 : 0;
    }
    this.saveSettings();
  }

  async saveSettings() {
    try {
      await this.storage.create();

      await this.storage.set('apiKeys', this.apiKeys);
      await this.storage.set('apiProviders', this.apiProviders);
      await this.storage.set('models', this.models);

      await this.storage.set('selectedModelIndex', this.selectedModelIndex);
      await this.storage.set('selectedApiKeyIndex', this.selectedApiKeyIndex);
      await this.storage.set('selectedApiProviderIndex', this.selectedApiProviderIndex);

      this.systemPrompt = (await this.storage.get('systemPrompt')) || 'You are a helpful assistant named Gaurika, Made by Gaurish Mehra.. You are much more than a simple llm, the default model is llama3.1-70b, but the user may change it.'; 

      await this.storage.set('isMultiTurnCotEnabled', this.isMultiTurnCotEnabled);
      await this.storage.set('isSingleTurnCotEnabled', this.isSingleTurnCotEnabled);
      await this.storage.set('isWebGroundingEnabled', this.isWebGroundingEnabled);
      await this.storage.set('isMultimodalEnabled', this.isMultimodalEnabled);

      const selectedModel = this.models[this.selectedModelIndex];
      const selectedApiProvider = this.apiProviders[this.selectedApiProviderIndex];

      await this.storage.set('baseUrl', selectedApiProvider.baseUrl || '');
      await this.storage.set('model', selectedModel.value);
      await this.storage.set('apiKey', this.apiKeys[this.selectedApiKeyIndex].key);

      console.log('Settings saved successfully!');

      window.location.reload();

    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  onCotToggleChange() {
    if (this.isMultiTurnCotEnabled && this.isSingleTurnCotEnabled) {
      if (this.isMultiTurnCotEnabled) {
        this.isSingleTurnCotEnabled = false;
      } else {
        this.isMultiTurnCotEnabled = false;
      }
    }

    if (this.isMultiTurnCotEnabled || this.isSingleTurnCotEnabled) {
      this.isWebGroundingEnabled = false;
    }
  }

  onWebGroundingToggleChange() {
    if (this.isWebGroundingEnabled) {
      this.isMultiTurnCotEnabled = false;
      this.isSingleTurnCotEnabled = false;
    }
  }

  onModelChange() {
    const selectedModel = this.models[this.selectedModelIndex];
    if (selectedModel) {
      this.selectedApiKeyIndex = selectedModel.apiKeyIndex || 0;
      this.selectedApiProviderIndex = selectedModel.apiProviderIndex || 0;
      this.isMultimodalEnabled = selectedModel.isMultimodal || false;
    }
  }

  ensureSelectedIndicesWithinBounds() {
    if (this.selectedApiKeyIndex >= this.apiKeys.length) {
      this.selectedApiKeyIndex = this.apiKeys.length > 0 ? this.apiKeys.length - 1 : 0;
    }

    if (this.selectedApiProviderIndex >= this.apiProviders.length) {
      this.selectedApiProviderIndex = this.apiProviders.length > 0 ? this.apiProviders.length - 1 : 0;
    }

    if (this.selectedModelIndex >= this.models.length) {
      this.selectedModelIndex = this.models.length > 0 ? this.models.length - 1 : 0;
    }
  }

  addDefaultEntriesIfNotPresent() {
    const defaultApiKeyExists = this.apiKeys.some(key => key.name === 'Default API Key');
    if (!defaultApiKeyExists) {
      this.apiKeys.push({ name: 'Default API Key', key: '123' });
    }

    const defaultApiProviderExists = this.apiProviders.some(provider => provider.name === 'Cerebras + proxy'); 
    if (!defaultApiProviderExists) {
      this.apiProviders.push({ name: 'Cerebras + proxy', baseUrl: 'https://proxy.gaurish.xyz/api/cerebras/v1/' });
    }

    const defaultModelExists = this.models.some(model => model.name === 'default');
    if (!defaultModelExists) {
      const defaultModelIndex = this.models.push({
        name: 'default',
        value: 'llama3.1-70b',
        apiKeyIndex: this.apiKeys.findIndex(key => key.name === 'Default API Key'),
        apiProviderIndex: this.apiProviders.findIndex(provider => provider.name === 'Cerebras + proxy'), 
        isMultimodal: false
      }) - 1;
      this.selectedModelIndex = defaultModelIndex; 
    }
  }
}