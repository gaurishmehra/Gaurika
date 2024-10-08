import { Component, Input } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-add-model-modal',
  templateUrl: './add-model-modal.component.html',
  styleUrls: ['./add-model-modal.component.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule, CommonModule]
})
export class AddModelModalComponent {
  @Input() model: { name: string; value: string; apiKeyIndex?: number; apiProviderIndex?: number; isMultimodal?: boolean } = { name: '', value: '' };
  @Input() index: number | null = null;
  @Input() apiKeys: { name: string; key: string }[] = [];
  @Input() apiProviders: { name: string; baseUrl?: string }[] = [];
  @Input() selectedApiKeyIndex: number = 0;
  @Input() selectedApiProviderIndex: number = 0;

  constructor(private modalController: ModalController) {
    if (this.index === null) {
      this.model.apiKeyIndex = this.selectedApiKeyIndex;
      this.model.apiProviderIndex = this.selectedApiProviderIndex;
      this.model.isMultimodal = false; // Default to false for new models
    }
  }

  closeModal() {
    this.modalController.dismiss();
  }

  saveModel() {
    console.log('Model data being saved:', this.model);
    this.modalController.dismiss({ data: this.model });
  }
}