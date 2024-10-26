import { Component, OnInit, NgZone } from '@angular/core';
import { Storage } from '@ionic/storage-angular';
import { AnimationController } from '@ionic/angular';
import { OpenAI } from 'openai';
import { Router } from '@angular/router';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; // Import FormsModule

import { IonicModule } from '@ionic/angular';





// Update interface to match Ionic's type
interface RangeChangeEventDetail {
  value: number | { lower: number; upper: number; };
}

@Component({
  selector: 'app-live',
  templateUrl: './live.page.html',
  styleUrls: ['./live.page.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule, CommonModule],
})


export class LivePage implements OnInit {
  isListening = false;
  isSpeaking = false;
  speechText = '';
  selectedSpeechToTextModel: string | null = null;
  selectedLiveLLMModel: string | null = null;
  animation: any;
  mediaRecorder: MediaRecorder | null = null;
  speechSynthesis: SpeechSynthesis;
  speechUtterance: SpeechSynthesisUtterance | null = null;

  speechToTextApiKey: string | null = null;
  speechToTextBaseUrl: string | null = null;
  speechToTextModel: string | null = null;

  liveLLMApiKey: string | null = null;
  liveLLMBaseUrl: string | null = null;
  liveLLMModel: string | null = null;

  // Voice settings
  selectedVoice: SpeechSynthesisVoice | null = null;
  availableVoices: SpeechSynthesisVoice[] = [];
  speechRate = 1;
  speechPitch = 1;
  speechVolume = 1;

  constructor(
    private router: Router,
    private storage: Storage,
    private ngZone: NgZone,
    private animationCtrl: AnimationController
  ) {
    this.speechSynthesis = window.speechSynthesis;
    
    if (this.speechSynthesis.onvoiceschanged !== undefined) {
      this.speechSynthesis.onvoiceschanged = this.loadVoices.bind(this);
    }
  }

  loadVoices() {
    this.availableVoices = this.speechSynthesis.getVoices();
    this.selectedVoice = this.availableVoices.find(
      voice => voice.lang.includes('en') && voice.name.includes('Female')
    ) || this.availableVoices[0];
  }

  async ngOnInit() {
    await this.storage.create();

    this.speechToTextApiKey = await this.storage.get('speechToTextApiKey');
    this.speechToTextBaseUrl = await this.storage.get('speechToTextBaseUrl');
    this.speechToTextModel = await this.storage.get('speechToTextModel');

    this.liveLLMApiKey = await this.storage.get('liveLLMApiKey');
    this.liveLLMBaseUrl = await this.storage.get('liveLLMBaseUrl');
    this.liveLLMModel = await this.storage.get('liveLLMModel');

    this.loadVoices();
  }

  async startListening() {
    this.isListening = true;
    this.startAnimations();

    if (!this.speechToTextApiKey || !this.speechToTextBaseUrl) {
      console.error('Speech-to-text API key or base URL not set!');
      return;
    }

    try {
      const openai = new OpenAI({
        apiKey: this.speechToTextApiKey,
        baseURL: this.speechToTextBaseUrl,
        dangerouslyAllowBrowser: true, 
      });

      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(audioStream);

      this.mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          const audioBlob = new Blob([event.data], { type: 'audio/webm' });
          const audioFile = new File([audioBlob], 'audio.webm', { type: 'audio/webm' });

          try {
            const transcription = await openai.audio.transcriptions.create({
              file: audioFile,
              model: this.speechToTextModel || 'whisper-large-v3-turbo',
              response_format: 'json'
            });

            this.ngZone.run(() => {
              this.speechText = transcription.text;
              if (this.speechText) {
                this.sendToLiveLLM(this.speechText);
              } else {
                console.error('Transcription returned empty text');
              }
            });
          } catch (transcriptionError) {
            console.error('Error during transcription:', transcriptionError);
          }
        }
      };

      this.mediaRecorder.start();

    } catch (error) {
      console.error('Error starting speech recognition:', error);
      this.isListening = false;
      this.stopAnimations();
    }
  }

  stopListening() {
    this.isListening = false;
    this.stopAnimations();

    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
      this.mediaRecorder = null;
    }
  }

  async sendToLiveLLM(text: string) {
    if (!this.liveLLMApiKey || !this.liveLLMBaseUrl) {
      console.error('Live LLM API key or base URL not set!');
      return;
    }

    try {
      const openai = new OpenAI({
        apiKey: this.liveLLMApiKey,
        baseURL: this.liveLLMBaseUrl,
        dangerouslyAllowBrowser: true, 
      });

      const response = await openai.chat.completions.create({
        model: this.liveLLMModel || 'llama3.1-8b',
        messages: [{ role: 'user', content: text }],
      });

      const llmResponse = response.choices[0]?.message?.content;
      if (llmResponse) {
        this.convertTextToSpeech(llmResponse);
      } else {
        console.error('Live LLM response is empty');
      }
    } catch (error) {
      console.error('Error sending to Live LLM:', error);
    }
  }

  convertTextToSpeech(text: string) {
    this.stopSpeaking();

    this.speechUtterance = new SpeechSynthesisUtterance(text);
    
    if (this.selectedVoice) {
      this.speechUtterance.voice = this.selectedVoice;
    }
    this.speechUtterance.rate = this.speechRate;
    this.speechUtterance.pitch = this.speechPitch;
    this.speechUtterance.volume = this.speechVolume;

    this.speechUtterance.onstart = () => {
      this.ngZone.run(() => {
        this.isSpeaking = true;
      });
    };

    this.speechUtterance.onend = () => {
      this.ngZone.run(() => {
        this.isSpeaking = false;
        this.speechUtterance = null;
      });
    };

    this.speechUtterance.onerror = (event) => {
      console.error('Speech synthesis error:', event);
      this.ngZone.run(() => {
        this.isSpeaking = false;
        this.speechUtterance = null;
      });
    };

    this.speechSynthesis.speak(this.speechUtterance);
  }

  stopSpeaking() {
    if (this.speechSynthesis) {
      this.speechSynthesis.cancel();
    }
    this.isSpeaking = false;
    this.speechUtterance = null;
  }

  setVoice(voice: SpeechSynthesisVoice) {
    this.selectedVoice = voice;
  }
  setRate(event: RangeChangeEventDetail) {
    const value = this.getRangeValue(event.value);
    this.speechRate = value;
  }

  setPitch(event: RangeChangeEventDetail) {
    const value = this.getRangeValue(event.value);
    this.speechPitch = value;
  }

  setVolume(event: RangeChangeEventDetail) {
    const value = this.getRangeValue(event.value);
    this.speechVolume = value;
  }

  // Helper method to handle both single value and range value cases
  private getRangeValue(value: number | { lower: number; upper: number; }): number {
    if (typeof value === 'number') {
      return value;
    }
    // For dual-handle ranges, you might want to use either lower or upper value
    // Here we're using lower, but you can adjust based on your needs
    return value.lower;
  }

  startAnimations() {
    const animationElement = document.querySelector('.animation-element');
    if (animationElement) {
      this.animation = this.animationCtrl.create()
        .addElement(animationElement)
        .duration(1000)
        .iterations(Infinity)
        .keyframes([
          { offset: 0, transform: 'scale(1)', opacity: '1' },
          { offset: 0.5, transform: 'scale(1.2)', opacity: '0.8' },
          { offset: 1, transform: 'scale(1)', opacity: '1' }
        ]);

      this.animation.play();
    }
  }

  stopAnimations() {
    if (this.animation) {
      this.animation.stop();
    }
  }
  gotoappmenu() {
    this.router.navigate(['/app']);
  }
}