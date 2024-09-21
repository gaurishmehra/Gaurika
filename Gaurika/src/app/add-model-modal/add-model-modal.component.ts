import { Component, Input } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-add-model-modal',
  templateUrl: './add-model-modal.component.html',
  styleUrls: ['./add-model-modal.component.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule]
})
export class AddModelModalComponent {
  @Input() model: { name: string, value: string } = { name: '', value: '' };
  @Input() index: number | null = null;

  constructor(private modalController: ModalController) {}

  closeModal() {
    this.modalController.dismiss();
  }

  saveModel() {
    this.modalController.dismiss({ name: this.model.name, value: this.model.value });
  }
}