import { Component, Input } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-add-api-provider-modal',
  templateUrl: './add-api-provider-modal.component.html',
  styleUrls: ['./add-api-provider-modal.component.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule]
})
export class AddApiProviderModalComponent {
  @Input() apiProvider: { name: string, baseUrl: string } = { name: '', baseUrl: '' };
  @Input() index: number | null = null;

  constructor(private modalController: ModalController) {}

  closeModal() {
    this.modalController.dismiss();
  }

  saveApiProvider() {
    this.modalController.dismiss({ name: this.apiProvider.name, baseUrl: this.apiProvider.baseUrl });
  }
}