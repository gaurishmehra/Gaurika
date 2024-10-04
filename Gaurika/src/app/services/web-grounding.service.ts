// web-grounding.service.ts
import { Injectable } from '@angular/core';
import * as cheerio from 'cheerio'; // Example using Cheerio for scraping

@Injectable({
  providedIn: 'root'
})
export class WebGroundingService {
  async webground(query: string): Promise<string> {
    try {
      const response = await fetch(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
      const html = await response.text();
      const $ = cheerio.load(html);

      const results: string[] = [];
      $('.g').each((i, el) => {
        const title = $(el).find('h3').text();
        const snippet = $(el).find('.IsZvec').text();
        results.push(`**${title}**\n${snippet}`);
      });

      return JSON.stringify({ result: results.join('\n\n') }); // Return structured JSON
    } catch (error) {
      console.error('Error during web grounding:', error);
      console.error('Error fetching web page:', error);
  return JSON.stringify({ error: 'Failed to fetch web page' });
    //   return JSON.stringify({ error: 'Failed to scrape web results' }); // Handle errors gracefully
    }
  }
}