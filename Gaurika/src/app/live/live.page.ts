import { Component, OnInit, NgZone } from '@angular/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Storage } from '@ionic/storage-angular';
import { AnimationController } from '@ionic/angular';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

@Component({
  selector: 'app-live',
  templateUrl: './live.page.html',
  styleUrls: ['./live.page.scss'],
})
export class LivePage implements OnInit {
  isListening = false;
  speechText = '';
  selectedSpeechToTextModel: string | null = null;
  selectedLLMModel: string | null = null;

  constructor(
    private storage: Storage,
    private ngZone: NgZone,
    private animationCtrl: AnimationController
  ) {}

  async ngOnInit() {
    await this.storage.create();
    this.selectedSpeechToTextModel = await this.storage.get('selectedSpeechToTextModel');
    this.selectedLLMModel = await this.storage.get('selectedLLMModel');
  }

  async startListening() {
    this.isListening = true;
    this.startAnimations();

    try {
      await SpeechRecognition.requestPermission();
      SpeechRecognition.start({
        language: 'en-US',
        onResult: (result) => {
          this.ngZone.run(() => {
            this.speechText = result.transcript;
          });
        },
        onError: (error) => {
          console.error('Speech recognition error:', error);
        },
      });
    } catch (error) {
      console.error('Error starting speech recognition:', error);
    }
  }

  stopListening() {
    this.isListening = false;
    this.stopAnimations();
    SpeechRecognition.stop();
  }

  startAnimations() {
    const animation = this.animationCtrl.create()
      .addElement(document.querySelector('.animation-element'))
      .duration(1000)
      .iterations(Infinity)
      .keyframes([
        { offset: 0, transform: 'scale(1)', opacity: '1' },
        { offset: 0.5, transform: 'scale(1.5)', opacity: '0.5' },
        { offset: 1, transform: 'scale(1)', opacity: '1' }
      ]);

    animation.play();
  }

  stopAnimations() {
    const animation = this.animationCtrl.create()
      .addElement(document.querySelector('.animation-element'))
      .duration(1000)
      .iterations(1)
      .keyframes([
        { offset: 0, transform: 'scale(1)', opacity: '1' },
        { offset: 1, transform: 'scale(1)', opacity: '1' }
      ]);

    animation.stop();
  }

  async convertTextToSpeech(text: string) {
    // Placeholder for text-to-speech conversion
    try {
      await TextToSpeech.speak({
        text: text,
        lang: 'en-US',
        rate: 1.0,
        pitch: 1.0,
        volume: 1.0
      });
    } catch (error) {
      console.error('Error converting text to speech:', error);
    }
  }
}
