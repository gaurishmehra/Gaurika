from flask import Flask, request, jsonify
import requests
from bs4 import BeautifulSoup
import json
from time import sleep, time
import os
from datetime import datetime
import logging
from urllib.parse import urlparse
import concurrent.futures
import nltk
from nltk.tokenize import sent_tokenize
import hashlib
import pandas as pd
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)

class EnhancedResearchTool:
    def __init__(self):
        """
        Initialize the enhanced research tool using environment variables
        """
        self.api_key = os.getenv('GOOGLE_API_KEY')
        self.cx_id = os.getenv('GOOGLE_CX_ID')
        
        if not self.api_key or not self.cx_id:
            raise ValueError("Missing required environment variables: GOOGLE_API_KEY and GOOGLE_CX_ID")
            
        self.base_url = "https://www.googleapis.com/customsearch/v1"
        self.results_dir = "research_results"
        self.cache_dir = os.path.join(self.results_dir, "cache")
        
        # Setup directories
        for directory in [self.results_dir, self.cache_dir]:
            os.makedirs(directory, exist_ok=True)
            
        # Setup logging
        logging.basicConfig(
            filename=os.path.join(self.results_dir, 'research.log'),
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s'
        )
        
        # Download NLTK data if needed
        try:
            nltk.data.find('tokenizers/punkt')
        except LookupError:
            nltk.download('punkt')
            
        self.excluded_domains = set()
        self.load_excluded_domains()

    def load_excluded_domains(self):
        """Load list of domains to exclude from research"""
        excluded_domains_file = 'excluded_domains.txt'
        try:
            if os.path.exists(excluded_domains_file):
                with open(excluded_domains_file, 'r') as f:
                    self.excluded_domains = set(line.strip() for line in f)
            else:
                # Create empty file if it doesn't exist
                with open(excluded_domains_file, 'w') as f:
                    pass
                self.excluded_domains = set()
        except Exception as e:
            logging.error(f"Error loading excluded domains: {e}")
            self.excluded_domains = set()

    def get_cache_path(self, url):
        """Generate cache file path for a URL"""
        url_hash = hashlib.md5(url.encode()).hexdigest()
        return os.path.join(self.cache_dir, f"{url_hash}.json")

    def search(self, query, max_results=10, start_index=1):
        """
        Enhanced search with pagination support
        """
        all_results = []
        
        while len(all_results) < max_results:
            params = {
                'key': self.api_key,
                'cx': self.cx_id,
                'q': query,
                'start': start_index,
                'num': min(10, max_results - len(all_results))
            }
            
            try:
                response = requests.get(self.base_url, params=params)
                response.raise_for_status()
                results = response.json().get('items', [])
                
                # Filter out excluded domains
                filtered_results = [
                    result for result in results
                    if urlparse(result['link']).netloc not in self.excluded_domains
                ]
                
                all_results.extend(filtered_results)
                
                if len(results) < 10:
                    break
                    
                start_index += 10
                sleep(1)  # Respect API rate limits
                
            except requests.exceptions.RequestException as e:
                logging.error(f"Search API error: {e}")
                break
                
        return all_results[:max_results]

    def extract_content(self, soup):
        """
        Enhanced content extraction with better formatting
        """
        # Remove unwanted elements
        for element in soup(['script', 'style', 'nav', 'footer', 'iframe', 'header']):
            element.decompose()
            
        # Extract article content if available
        article = soup.find('article')
        if article:
            content = article
        else:
            content = soup.find('main') or soup.find('body')
            
        if not content:
            return None
            
        # Extract paragraphs
        paragraphs = content.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
        
        # Process and clean text
        processed_text = []
        for p in paragraphs:
            text = p.get_text(strip=True)
            if len(text) > 50:  # Filter out short snippets
                sentences = sent_tokenize(text)
                processed_text.extend(sentences)
                
        return "\n\n".join(processed_text)

    def fetch_content(self, url, delay=1):
        """
        Enhanced content fetching with caching and better error handling
        """
        cache_path = self.get_cache_path(url)
        
        # Check cache first
        if os.path.exists(cache_path):
            with open(cache_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        
        headers = {
            'User-Agent': 'ResearchBot/2.0 (Educational Purpose Research Tool)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
            'Accept-Language': 'en-US,en;q=0.5'
        }
        
        try:
            sleep(delay)
            response = requests.get(url, headers=headers, timeout=15)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            content = self.extract_content(soup)
            
            if content:
                # Cache the results
                cache_data = {
                    'content': content,
                    'timestamp': datetime.now().isoformat(),
                    'url': url
                }
                with open(cache_path, 'w', encoding='utf-8') as f:
                    json.dump(cache_data, f, ensure_ascii=False, indent=2)
                
                return cache_data
            
        except Exception as e:
            logging.error(f"Content fetch error for {url}: {e}")
            return None

    def process_results_parallel(self, search_results):
        """Process search results in parallel"""
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            future_to_url = {
                executor.submit(self.fetch_content, result.get('link')): result
                for result in search_results
            }
            
            processed_results = []
            for future in concurrent.futures.as_completed(future_to_url):
                result = future_to_url[future]
                try:
                    content_data = future.result()
                    if content_data:
                        processed_results.append({
                            'title': result.get('title'),
                            'url': result.get('link'),
                            'content': content_data['content'],
                            'snippet': result.get('snippet'),
                            'fetch_time': content_data.get('timestamp')
                        })
                except Exception as e:
                    logging.error(f"Error processing {result.get('link')}: {e}")
                    
        return processed_results

    def generate_summary_report(self, query, results):
        """Generate a summary report of the research"""
        df = pd.DataFrame(results)
        
        summary = {
            'query': query,
            'total_sources': len(results),
            'avg_content_length': df['content'].str.len().mean(),
            'sources': df['url'].tolist(),
            'titles': df['title'].tolist()
        }
        
        return summary

    def save_research(self, query, results, execution_time):
        """Modified research saving to only save summary"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Generate summary
        summary = self.generate_summary_report(query, results)
        summary['execution_time'] = execution_time
        summary['timestamp'] = timestamp
        
        # Save only the summary
        summary_filename = f"{self.results_dir}/research_{timestamp}_summary.json"
        with open(summary_filename, 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2)
        
        return summary

    def research(self, query, max_results=5):
        """
        Modified research process to return JSON response
        """
        start_time = time()
        logging.info(f"Starting research for: {query}")
        
        # Get search results
        search_results = self.search(query, max_results)
        
        # Process results in parallel
        processed_results = self.process_results_parallel(search_results)
        
        # Calculate execution time
        execution_time = time() - start_time
        
        # Save and return results
        summary = self.save_research(query, processed_results, execution_time)
        
        logging.info(f"Research completed in {execution_time:.2f} seconds")
        
        return {
            'summary': summary,
            'results': processed_results,
            'execution_time': execution_time
        }

# Initialize the research tool
research_tool = EnhancedResearchTool()

@app.route('/research', methods=['POST'])
def do_research():
    data = request.get_json()
    
    if not data or 'query' not in data:
        return jsonify({'error': 'Missing query parameter'}), 400
        
    query = data['query']
    max_results = data.get('max_results', 5)
    
    try:
        results = research_tool.research(query, max_results)
        print("request ayi thi")
        return jsonify(results)
    except Exception as e:
        logging.error(f"Error processing research request: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == "__main__":
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port)