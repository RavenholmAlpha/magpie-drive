# Magpie Drive 🐦
[中文版本 (Chinese Version)](README.zh.md)
> An extremely lightweight Node.js file management system for people who hate complicated setups.
> The entire project is only 100kb in size.

## 🎯 What the f is this?

Magpie Drive is a minimalist file management system written in Node.js.
- No fancy-ass UI
- No complicated database configuration
- No headache-inducing dependencies
- Only the most practical file management features

Like a magpie, it's simple, fast, and helps you carry things (files).

## ✨ What can it do?

- 📤 **File Upload**: Drag-and-drop upload, batch upload, folder upload
- 📥 **File Download**: Single file download, batch download (ZIP)
- 🗂️ **File Management**: Create folders, move files, batch delete
- 🔍 **File Search**: Global search, quick file location
- 🔐 **User Authentication**: Supports two roles: admin and guest
- 📱 **Responsive Design**: Works on any device

## 🚀 How to use this ?

### 1. Install the environment

First, you need Node.js installed on your system. If you don't have it, go download it from the official website: [Node.js](https://nodejs.org/).

### 2. Start the server

```bash
# Linux/Mac
./start-server.sh

# Windows
start-server.bat
```

Or start manually:

```bash
node server.js [port]  # Port is optional, default is 8000
```

### 3. Access the system

Open your browser and enter: `http://localhost:8000`

### 4. Login

- **Admin account**: admin / admin
- **Guest account**: guest / guest

## 🛠️ Tech Stack

- **Backend**: Node.js (pure native, no frameworks, badass right?)
- **Frontend**: HTML + CSS + JavaScript (also pure native)
- **Other**: JSZip (for batch download packaging)

## 🤔 Why the fuck did I write this?

- Tired of those bloated file management systems
- Don't want to configure databases (even SQLite is too much hassle)
- Wanted to write a lightweight tool I can actually use
- Wanted to roast those complex tech stacks (yes, I'm looking at you, React + Express + MongoDB)

## 📁 Project Structure

```
ravenhs/
├── files/          # Public file storage directory
├── secret/         # Admin-only file directory
├── index.html      # Homepage
├── login.html      # Login page
├── style.css       # Style file
├── script.js       # Frontend logic
├── server.js       # Backend code
├── start-server.sh # Linux startup script
└── start-server.bat # Windows startup script
```

## 🚨 Notes

- This project is simple, don't use it in production!
- No data backup function, don't come crying to me if you lose files!
- Passwords are hardcoded, don't ask why, laziness is the answer! (But I didn't write them in the HTML, just in the server.js, at least I didn't)
- CORS is written,but default is all open, don't ask why, it's just easier for frontend debugging!

## 📄 License

MIT License (no one will use this anyway, do whatever you want)

## 🙏 Contributions

Feel free to submit Issues and PRs, but don't expect me to look at them (just kidding, I'll try).

---

**Finally**: This project is just a toy, don't take it too seriously. If you like it, give it a Star; if you hate it, don't骂 me (curse me), I'm just a magpie.🐦

---


[中文版本 (Chinese Version)](README.zh.md)
