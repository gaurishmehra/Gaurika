import { Component, Input } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { IonicModule } from '@ionic/angular'; // Import IonicModule
import { FormsModule } from '@angular/forms'; // Import FormsModule

@Component({
  selector: 'app-add-api-key-modal',
  templateUrl: './add-api-key-modal.component.html',
  styleUrls: ['./add-api-key-modal.component.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule] // Add IonicModule and FormsModule here
})
export class AddApiKeyModalComponent {
  @Input() apiKey: { name: string, key: string } = { name: '', key: '' };
  @Input() index: number | null = null; 

  constructor(private modalController: ModalController) {}

  closeModal() {
    this.modalController.dismiss();
  }

  saveApiKey() {
    this.modalController.dismiss({ name: this.apiKey.name, key: this.apiKey.key });
  }
}