import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import {
  ModalController,
  IonContent,
  Platform,
  LoadingController,
  ToastController,
  AlertController,
  ActionSheetController
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';


@Component({
  selector: 'app',
  templateUrl: './app.page.html',
  styleUrls: ['./app.page.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule, CommonModule],
})
export class AppPage  implements OnInit {

  constructor(private router: Router) {}

  ngOnInit() {}

  goToHome() {
    this.router.navigate(['/home']);
  }
  goToVoice() {
    this.router.navigate(['/home']);
  }
}
