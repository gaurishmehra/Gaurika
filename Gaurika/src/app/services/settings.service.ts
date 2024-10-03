// src/app/services/settings.service.ts
import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';
import { Router } from '@angular/router';

// Interface for API Key objects
interface ApiKey {
  name: string;
  key: string;
}

// Interface for API Provider objects
interface ApiProvider {
  name: string;
  baseUrl?: string;
}

// Interface for Model objects
interface Model {
  name: string;
  value: string;
  apiKeyIndex?: number;
  apiProviderIndex?: number;
  isMultimodal?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  constructor(private storage: Storage, private router: Router) {}

  async saveDefaultSettings() {
    try {
      await this.storage.create();

      // API Keys
      const defaultApiKeyExists = (await this.storage.get('apiKeys'))?.some((key: ApiKey) => key.name === 'Default API Key');
      if (!defaultApiKeyExists) {
        await this.storage.set('apiKeys', [{ name: 'Default API Key', key: '123' }]);
      }

      // API Providers
      const defaultApiProviderExists = (await this.storage.get('apiProviders'))?.some((provider: ApiProvider) => provider.name === 'Cerebras + proxy');
      if (!defaultApiProviderExists) {
        await this.storage.set('apiProviders', [{ name: 'Cerebras + proxy', baseUrl: 'https://proxy.gaurish.xyz/api/cerebras/v1/' }]);
      }

      // Models
      const defaultModelExists = (await this.storage.get('models'))?.some((model: Model) => model.name === 'default');
      if (!defaultModelExists) {
        const apiKeys: ApiKey[] = (await this.storage.get('apiKeys')) || [];
        const apiProviders: ApiProvider[] = (await this.storage.get('apiProviders')) || [];
        const defaultModelIndex = (await this.storage.get('models'))?.push({
          name: 'default',
          value: 'llama3.1-70b',
          apiKeyIndex: apiKeys.findIndex((key: ApiKey) => key.name === 'Default API Key'),
          apiProviderIndex: apiProviders.findIndex((provider: ApiProvider) => provider.name === 'Cerebras + proxy'),
          isMultimodal: false
        }) - 1 || 0; // Handle case where models array is empty
        await this.storage.set('selectedModelIndex', defaultModelIndex);
      }

      // System Prompt
      const storedSystemPrompt = await this.storage.get('systemPrompt');
      if (!storedSystemPrompt) {
        await this.storage.set('systemPrompt', 'You are a helpful assistant named Gaurika, Made by Gaurish Mehra.. You are much more than a simple llm, the default model is llama3.1-70b, but the user may change it.');
      }

      // Other Settings (Initialize if not present)
      if (!(await this.storage.get('isMultiTurnCotEnabled'))) {
        await this.storage.set('isMultiTurnCotEnabled', false); 
      }
      if (!(await this.storage.get('isSingleTurnCotEnabled'))) {
        await this.storage.set('isSingleTurnCotEnabled', false);
      }
      if (!(await this.storage.get('isWebGroundingEnabled'))) {
        await this.storage.set('isWebGroundingEnabled', false);
      }
      if (!(await this.storage.get('isMultimodalEnabled'))) {
        await this.storage.set('isMultimodalEnabled', false); 
      }

      // Set default selected indices if not already set
      if (!(await this.storage.get('selectedApiKeyIndex'))) {
        await this.storage.set('selectedApiKeyIndex', 0);
      }
      if (!(await this.storage.get('selectedApiProviderIndex'))) {
        await this.storage.set('selectedApiProviderIndex', 0);
      }

      // Set baseUrl, model, and apiKey based on selected indices
      const models: Model[] = (await this.storage.get('models')) || [];
      const apiProviders: ApiProvider[] = (await this.storage.get('apiProviders')) || [];
      const apiKeys: ApiKey[] = (await this.storage.get('apiKeys')) || [];
      const selectedModelIndex = (await this.storage.get('selectedModelIndex')) || 0;
      const selectedApiProviderIndex = (await this.storage.get('selectedApiProviderIndex')) || 0;
      const selectedApiKeyIndex = (await this.storage.get('selectedApiKeyIndex')) || 0;

      await this.storage.set('baseUrl', apiProviders[selectedApiProviderIndex]?.baseUrl || '');
      await this.storage.set('model', models[selectedModelIndex]?.value || '');
      await this.storage.set('apiKey', apiKeys[selectedApiKeyIndex]?.key || '');

      console.log('Default settings saved successfully!');

      this.router.navigate(['/home']); // Navigate to home page
    } catch (error) {
      console.error('Error saving default settings:', error);
    }
  }


}