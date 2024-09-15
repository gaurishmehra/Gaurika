# llm-chat

A simple chat application built with Ionic that utilizes Large Language Models (LLMs) for conversation.

## About

This application provides a basic chat interface powered by LLMs. It's designed to be easily adaptable to any LLM API that's compatible with the OpenAI SDK. While it can be used as a website, it's primarily intended for Android devices.

## How to Use

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/gaurishmehra/Gaurika
   ```

2. **Navigate to the Project Directory:**
   ```bash
   cd Gaurika/Gaurika
   ```

3. **Build for Android (Ionic required):**
   ```bash
   ionic cap build android
   ```
4.**optional**
 If you want to try it out as website use : 
```bash
ionic serve -lag
```

**Note:** You need to have Ionic and the necessary Android development tools installed on your system.

## Configuration

Before running the application, you'll need to ensure that your LLM API endpoint, API keys, and selected model are all compatible. The default base URLs provided are for Groq and Cerebras, but you can add more providers and models using the application's UI. 

**Important:** Ensure that the selected model is supported by the chosen API provider and that your API key is valid.

### Customization

* **System Prompt:** You can customize the system prompt to influence the LLM's behavior and personality. 
* **Multiple Chat Sessions:** The application supports multiple independent chat sessions, allowing you to interact with different LLMs or maintain separate conversations.

## Storage

All data, including chat history and configuration settings, is stored locally on your device.

## Contributing

Contributions are welcome! If you'd like to enhance the application, feel free to fork the repository, make your changes, and submit a pull request. 

## Features

* Basic chat interface.
* Compatibility with OpenAI SDK-compatible LLMs.
* Android build using Ionic Capacitor.
* Customizable system prompt.
* Support for multiple chat sessions.
* Local storage of data.
* UI for adding custom LLM providers and models.

## Future Enhancements

* **Improved UI/UX:** Enhanced design and user experience.
* **Conversation History:** Improved management and display of conversation history.
* **Advanced Features:** Integration of features like text summarization, translation, etc.

## Disclaimer

This is a basic implementation and may require further development for production use. 

## License

This project is licensed under the [MIT License](LICENSE). 
