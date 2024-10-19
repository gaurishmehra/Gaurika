# Gaurika

A simple chat application built with Ionic that utilizes Large Language Models (LLMs) for conversation.

#### Note : - My laptop's screen is kinda dead.. so the project developement is on hold for a while.. The website should work fine.. but updates are out of the question..and obviously the apk releases are on a hold aswell. (The latest one is super old in comparison to the website)

## About

This application provides a basic chat interface powered by LLMs. It's designed to be easily adaptable to any LLM API that's compatible with the OpenAI SDK. While it can be used as a website, it's primarily intended for Android devices. 

**Try it out:** [https://chat.gaurish.xyz/](https://chat.gaurish.xyz/)

The default model uses a proxy to Cerebras 70B, allowing free usage with a slight latency. You can select the default model in the settings or add models from any OpenAI-compatible endpoint via the advanced settings menu.

## How to Use Locally

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
4. **optional**
```bash
#If you want to try it out as website use : 
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

**TODO**

## Future Enhancements

* **Improved UI/UX:** Enhanced design and user experience.
* **Conversation History:** Improved management and display of conversation history.
* **Advanced Features:** Integration of features like text summarization, translation, etc.

## Disclaimer

This is a basic implementation and may require further development for production use. 

## License

This project is licensed under the [MIT License](LICENSE). 