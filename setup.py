import os
import json

# Target folder name
target_dir = "html"
os.makedirs(target_dir, exist_ok=True)
os.makedirs(os.path.join(target_dir, ".vscode"), exist_ok=True)

# 1. .gitignore
gitignore_content = """# Dependency directories
node_modules/
jspm_packages/

# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Local env files
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Build outputs
dist/
build/
out/

# IDE files
.idea/
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
"""

with open(os.path.join(target_dir, ".gitignore"), 'w', encoding='utf-8') as f:
    f.write(gitignore_content.strip())

# 2. .env.example
env_example_content = """# URL Web App dari Google Apps Script (GAS)
# Salin file ini menjadi .env lalu isi nilai aslinya di sana.
# Jangan pernah mengunggah file .env asli ke GitHub!

# Jika menggunakan React (CRA):
REACT_APP_GAS_URL=https://script.google.com/macros/s/PASTE_YOUR_SCRIPT_ID_HERE/exec

# Jika menggunakan Vite:
# VITE_GAS_URL=https://script.google.com/macros/s/PASTE_YOUR_SCRIPT_ID_HERE/exec

# Jika menggunakan Node.js/Backend:
# GAS_URL=https://script.google.com/macros/s/PASTE_YOUR_SCRIPT_ID_HERE/exec
"""

with open(os.path.join(target_dir, ".env.example"), 'w', encoding='utf-8') as f:
    f.write(env_example_content.strip())

# 3. .vscode/tasks.json
tasks_json_content = """{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Auto Start Server",
      "type": "shell",
      "command": "powershell",
      "args": [
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        "${workspaceFolder}/start-server.ps1"
      ],
      "presentation": {
        "reveal": "always",
        "panel": "new",
        "group": "starter"
      },
      "runOptions": {
        "runOn": "folderOpen"
      },
      "group": {
        "kind": "background",
        "isDefault": true
      }
    }
  ]
}
"""

with open(os.path.join(target_dir, ".vscode", "tasks.json"), 'w', encoding='utf-8') as f:
    f.write(tasks_json_content.strip())

# 4. package.json
package_json_data = {
  "name": "html-app-project",
  "version": "1.0.0",
  "description": "Aplikasi web terintegrasi dengan Google Apps Script",
  "main": "index.js",
  "scripts": {
    "start": "powershell -ExecutionPolicy Bypass -File ./start-server.ps1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "dependencies": {}
}

with open(os.path.join(target_dir, "package.json"), 'w', encoding='utf-8') as f:
    json.dump(package_json_data, f, indent=2)

print("Semua file berhasil dibuat langsung di dalam folder 'html'.")