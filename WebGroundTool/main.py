import unicodedata
from flask import Flask, request, jsonify
import requests
from bs4 import BeautifulSoup
import json
from time import sleep, time
import os
from datetime import datetime
import logging
import argparse
from urllib.parse import urlparse
import concurrent.futures
import nltk
from nltk.tokenize import sent_tokenize
import hashlib
import pandas as pd
from dotenv import load_dotenv
import re
from html import unescape
import trafilatura
# import spacy
# nlp = spacy.load('en_core_web_sm')
# from nltk.corpus import stopwords
# from lexrank import LexRank
# from lexrank.mappings.stopwords import STOPWORDS
# from sklearn.feature_extraction.text import TfidfVectorizer
# from nltk.tokenize import sent_tokenize, word_tokenize
# from nltk.corpus import stopwords
# import numpy as np
# from networkx import Graph, pagerank
# from sklearn.cluster import KMeans
# from sentence_transformers import SentenceTransformer

# Load environment variables
load_dotenv()

# Add argument parser
parser = argparse.ArgumentParser(description='Enhanced Research Tool')
parser.add_argument('--debug', action='store_true', help='Enable debug mode with detailed output files')
args = parser.parse_args()

app = Flask(__name__)

class TextFormatter:

    @staticmethod
    def clean_text(text):
        """Enhanced text cleaning that preserves structure"""
        # Remove extra whitespace while preserving paragraph breaks
        text = re.sub(r'\n\s*\n', '\n\n', text)
        text = re.sub(r' +', ' ', text)
        
        # Clean common web artifacts
        text = re.sub(r'Subscribe to our newsletter|Cookie Policy|Accept Cookies|Share this article', '', text)
        text = re.sub(r'Advertisement|Sponsored Content|Read more:', '', text)
        
        # Standardize headings
        text = re.sub(r'<h[1-6]>', '## ', text)
        text = re.sub(r'</h[1-6]>', '\n\n', text)
        
        # Preserve list formatting
        text = re.sub(r'<li>', '* ', text)
        text = re.sub(r'</li>', '\n', text)
        
        text = unescape(text)
        text = unicodedata.normalize('NFKC', text)
        return text.strip()

    def format_content(self, title, authors, published_date, text):
        """Format content with improved readability"""
        formatted_text = f"# {title}\n\n"
        
        # Metadata section
        metadata = []
        if authors:
            metadata.append(f"**Authors:** {', '.join(authors)}")
        if published_date:
            metadata.append(f"**Published:** {published_date.strftime('%Y-%m-%d')}")
        if metadata:
            formatted_text += " | ".join(metadata) + "\n\n---\n\n"

        # Main content with improved formatting
        cleaned_text = self.clean_text(text)
        
        # Ensure proper section breaks
        sections = re.split(r'\n##\s+', cleaned_text)
        if len(sections) > 1:
            main_text = sections[0]
            section_texts = sections[1:]
            
            formatted_text += main_text + "\n\n"
            
            for section in section_texts:
                section = section.strip()
                if section:
                    formatted_text += f"## {section}\n\n"
        else:
            formatted_text += cleaned_text

        return formatted_text

    def extract_content(self, url):
        """Enhanced content extraction"""
        try:
            downloaded = trafilatura.fetch_url(url)
            if downloaded:
                # Try different extraction methods
                content = trafilatura.extract(
                    downloaded,
                    include_formatting=True,
                    include_links=True,
                    include_images=False,
                    output_format='markdown',
                    include_tables=True
                )
                
                if not content or len(content.strip()) < 100:
                    # Fallback to BeautifulSoup if trafilatura fails
                    soup = BeautifulSoup(downloaded, 'html.parser')
                    
                    # Remove unwanted elements
                    for element in soup.find_all(['script', 'style', 'nav', 'footer', 'iframe']):
                        element.decompose()
                    
                    # Extract main content
                    main_content = soup.find('main') or soup.find('article') or soup.find('div', class_=re.compile(r'content|article|post'))
                    if main_content:
                        content = main_content.get_text('\n')
                
                return content
            
        except Exception as e:
            logging.error(f"Content extraction error: {str(e)}")
            return None

class EnhancedResearchTool:
    def __init__(self, debug_mode=False):
        """
        Initialize the enhanced research tool using environment variables
        """
        self.debug_mode = debug_mode
        self.api_key = os.getenv('GOOGLE_API_KEY')
        self.cx_id = os.getenv('GOOGLE_CX_ID')
        self.text_formatter = TextFormatter()
        
        if not self.api_key or not self.cx_id:
            raise ValueError("Missing required environment variables: GOOGLE_API_KEY and GOOGLE_CX_ID")
            
        self.base_url = "https://www.googleapis.com/customsearch/v1"
        self.results_dir = "research_results"
        self.cache_dir = os.path.join(self.results_dir, "cache")
        self.debug_dir = os.path.join(self.results_dir, "debug")
        
        # Setup directories with logging
        for directory in [self.results_dir, self.cache_dir, self.debug_dir]:
            try:
                os.makedirs(directory, exist_ok=True)
                logging.debug(f"Directory ensured: {directory}")
            except Exception as e:
                logging.error(f"Error creating directory {directory}: {e}")
            
        # Enhanced logging setup
        log_format = '%(asctime)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s'
        logging.basicConfig(
            filename=os.path.join(self.results_dir, 'research.log'),
            level=logging.DEBUG if debug_mode else logging.INFO,
            format=log_format
        )
        
        # Add console handler for debug mode
        if debug_mode:
            console_handler = logging.StreamHandler()
            console_handler.setFormatter(logging.Formatter(log_format))
            logging.getLogger().addHandler(console_handler)
            
        # Download NLTK data if needed
        try:
            nltk.data.find('tokenizers/punkt')
        except LookupError:
            nltk.download('punkt', quiet=not debug_mode)

        try:
            nltk.data.find('corpora/stopwords')
        except LookupError:
            nltk.download('stopwords', quiet=not debug_mode)
            
        self.excluded_domains = set()
        self.load_excluded_domains()
        self.session = requests.Session()

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

    def extract_content(self, url):
        """Improved content extraction using trafilatura with NLP enhancements"""
        try:
            downloaded = trafilatura.fetch_url(url)
            if downloaded:
                content = trafilatura.extract(
                    downloaded,
                    include_formatting=True,
                    output_format='markdown'
                )
                if content:
                    metadata = trafilatura.extract_metadata(downloaded)
                    title = ''
                    authors = []
                    published_date = None
                    if metadata and isinstance(metadata, dict):
                        title = metadata.get('title', '')
                        authors = metadata.get('authors', [])
                        published_date_str = metadata.get('date')
                        if published_date_str:
                            try:
                                published_date = datetime.fromisoformat(published_date_str)
                            except ValueError:
                                published_date = None
                    # Clean text (preserve formatting)
                    cleaned_text = self.text_formatter.clean_text(content)
                    # Format content with advanced NLP processing
                    formatted_content = self.text_formatter.format_content(
                        title, authors, published_date, cleaned_text
                    )
                    return formatted_content
                else:
                    logging.error(f"Content extraction failed for {url}")
            else:
                logging.error(f"Failed to download content from {url}")
        except Exception as e:
            logging.error(f"Failed to extract content from {url}: {e}")
        return None

    def save_debug_content(self, query, title, content):
        """Ensure debug content is saved correctly"""
        filename_safe_query = re.sub(r'[^\w\s]', '', query).replace(' ', '_')[:50]
        debug_file = os.path.join(self.debug_dir, f"debug_{filename_safe_query}.txt")
        try:
            with open(debug_file, 'a', encoding='utf-8') as f:
                separator = f"\n{'='*100}\n"
                f.write(f"Source Title: {title}{separator}{content}{separator}")
            logging.debug(f"Debug content saved: {debug_file}")
        except Exception as e:
            logging.error(f"Error saving debug content: {e}")

    def fetch_content(self, url, query):
        """Optimized content fetching using a shared session"""
        cache_path = self.get_cache_path(url)
        if (os.path.exists(cache_path)):
            with open(cache_path, 'r', encoding='utf-8') as f:
                cached_data = json.load(f)
                if self.debug_mode:
                    self.save_debug_content(query, f"[CACHED] {url}", cached_data.get('content', ''))
                return cached_data
        try:
            content = self.extract_content(url)
            if content:
                cache_data = {
                    'content': content,
                    'timestamp': datetime.now().isoformat(),
                    'url': url
                }
                with open(cache_path, 'w', encoding='utf-8') as f:
                    json.dump(cache_data, f, ensure_ascii=False, indent=2)
                if self.debug_mode:
                    self.save_debug_content(query, url, content)
                return cache_data
            else:
                logging.error(f"No content extracted for {url}")
                return {}
        except Exception as e:
            logging.error(f"Content fetch error for {url}: {e}")
            if self.debug_mode:
                self.save_debug_content(query, f"[ERROR] {url}", f"Error: {str(e)}")
            return {}

    def process_results_parallel(self, query, search_results):
        """Process search results in parallel with increased workers"""
        max_workers = min(10, len(search_results))
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_result = {
                executor.submit(self.fetch_content, result.get('link'), query): result
                for result in search_results
            }

            processed_results = []
            for future in concurrent.futures.as_completed(future_to_result):
                result = future_to_result[future]
                try:
                    content_data = future.result()
                    if content_data and content_data.get('content'):
                        processed_results.append({
                            'title': result.get('title'),
                            'url': result.get('link'),
                            'content': content_data['content'],
                            'snippet': result.get('snippet'),
                            'fetch_time': content_data.get('timestamp')
                        })
                    else:
                        logging.warning(f"No content data for URL: {result.get('link')}")
                except Exception as e:
                    logging.error(f"Error processing {result.get('link')}: {e}")
        return processed_results

    def generate_summary_report(self, query, results):
        """Generate a summary report of the research"""
        df = pd.DataFrame(results)
        if not df.empty and 'content' in df.columns:
            avg_content_length = df['content'].str.len().mean()
        else:
            avg_content_length = 0

        summary = {
            'query': query,
            'total_sources': len(results),
            'avg_content_length': avg_content_length,
            'sources': df['url'].tolist() if 'url' in df.columns else [],
            'titles': df['title'].tolist() if 'title' in df.columns else []
        }

        return summary

    def save_research(self, query, results, execution_time):
        """Ensure the summary is saved even when debug mode is used"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Generate summary
        summary = self.generate_summary_report(query, results)
        summary['execution_time'] = execution_time
        summary['timestamp'] = timestamp
        
        # Save the summary
        summary_filename = os.path.join(self.results_dir, f"research_{timestamp}_summary.json")
        try:
            with open(summary_filename, 'w', encoding='utf-8') as f:
                json.dump(summary, f, indent=2)
            logging.info(f"Summary saved: {summary_filename}")
        except Exception as e:
            logging.error(f"Error saving summary JSON: {e}")
        
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
        processed_results = self.process_results_parallel(query, search_results)
        
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

    def __del__(self):
        """Close the session when the object is deleted"""
        self.session.close()

# Initialize the research tool with debug mode from command line args
research_tool = EnhancedResearchTool(debug_mode=args.debug)

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