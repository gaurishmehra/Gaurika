import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { HomePage } from './home/home.page'; // Import HomePage
import { SettingsPage } from './settings/settings.page'; // Import SettingsPage
import {AppPage} from './app/app.page';

const routes: Routes = [
  {
    path: 'home',
    component: HomePage // Use HomePage component directly
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: 'settings',
    component: SettingsPage // Use SettingsPage component directly
  },
  {
    path: 'app',
    component: AppPage
  },
  {
    path: 'live',
    loadChildren: () => import('./live/live.module').then( m => m.LivePageModule)
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }