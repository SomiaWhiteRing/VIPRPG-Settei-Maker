// ==UserScript==
// @name         Bangumi Character Creator Helper
// @namespace    https://github.com/your-username/bgm-creator-helper
// @version      0.1
// @description  Help to create character on Bangumi
// @author       Your name
// @match        https://bangumi.tv/character/new
// @grant        GM_xmlhttpRequest
// @grant        GM_getResourceText
// @resource     CHAR_DATA file:///D:/NetDisk/OneDrive/文档/GitHub/VIPRPG-Settei-Maker/characters.json
// ==/UserScript==

(function () {
  'use strict';

  const IMAGE_BASE_PATH = 'D:/NetDisk/OneDrive/文档/GitHub/VIPRPG-Settei-Maker/images/';
  let imageCache = new Map();

  // 添加IndexedDB相关代码
  const dbName = 'CharacterCreatorDB';
  const storeName = 'imageStore';
  let db;

  // 初始化数据库
  async function initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      };
    });
  }

  // 保存图片到IndexedDB
  async function saveImagesToDB(images) {
    if (!db) {
      console.error('Database not initialized');
      throw new Error('数据库未初始化');
    }

    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);

    const promises = Array.from(images.entries()).map(([name, data]) => {
      return new Promise((resolve, reject) => {
        const request = store.put(data, name);
        request.onsuccess = () => {
          console.log('Saved image:', name);
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    });

    await Promise.all(promises);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        console.log('All images saved successfully');
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  // 从IndexedDB加载图片
  async function loadImagesFromDB() {
    if (!db) {
      console.error('Database not initialized');
      throw new Error('数据库未初始化');
    }

    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      const keyRequest = store.getAllKeys();

      let keys, values;

      keyRequest.onsuccess = () => {
        keys = keyRequest.result;
        if (values) createImageMap();
      };

      request.onsuccess = () => {
        values = request.result;
        if (keys) createImageMap();
      };

      function createImageMap() {
        const images = new Map();
        keys.forEach((key, index) => {
          images.set(key, values[index]);
        });
        console.log('Loaded images from DB:', images.size);
        resolve(images);
      }

      request.onerror = () => reject(request.error);
      keyRequest.onerror = () => reject(keyRequest.error);
    });
  }

  // 添加图片加载函数
  async function loadLocalImage(imagePath) {
    if (imageCache.has(imagePath)) {
      return imageCache.get(imagePath);
    }

    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.style.display = 'none';

      input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const dataUrl = event.target.result;
            imageCache.set(imagePath, dataUrl);
            resolve(dataUrl);
          };
          reader.readAsDataURL(file);
        } else {
          resolve(null);
        }
        document.body.removeChild(input);
      });

      // 自动触发文件选择
      document.body.appendChild(input);
      input.click();
    });
  }

  // 创建右侧面板
  function createSidePanel() {
    const panel = document.createElement('div');
    panel.id = 'character-list-panel';
    panel.style.cssText = `
            position: fixed;
            right: 20px;
            top: 100px;
            width: 400px;
            max-height: 80vh;
            background: white;
            border: 1px solid #ddd;
            border-radius: 5px;
            padding: 10px;
            overflow-y: auto;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            z-index: 1000;
        `;

    const header = document.createElement('div');
    header.style.cssText = `
            font-weight: bold;
            margin-bottom: 10px;
            padding-bottom: 5px;
            border-bottom: 1px solid #eee;
        `;
    header.textContent = '角色列表';

    const searchBox = document.createElement('input');
    searchBox.type = 'text';
    searchBox.placeholder = '搜索角色...';
    searchBox.style.cssText = `
            width: 100%;
            padding: 5px;
            margin-bottom: 10px;
            border: 1px solid #ddd;
            border-radius: 3px;
        `;
    searchBox.addEventListener('input', (e) => filterCharacters(e.target.value));

    const list = document.createElement('div');
    list.id = 'character-list';
    list.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 5px;
        `;

    panel.appendChild(header);
    panel.appendChild(searchBox);
    panel.appendChild(list);
    document.body.appendChild(panel);
  }

  // 修改加载角色数据的函数
  function loadCharacterData() {
    try {
      // 使用GM_getResourceText读取JSON文件
      const jsonData = GM_getResourceText('CHAR_DATA');
      const characters = JSON.parse(jsonData);
      console.log('Successfully loaded characters:', characters);

      if (!characters || Object.keys(characters).length === 0) {
        console.error('No character data found in JSON');
        addFileSelector();
        return;
      }

      displayCharacters(characters);
    } catch (error) {
      console.error('Error loading characters:', error);
      // 添加错误提示到面板
      const list = document.getElementById('character-list');
      list.innerHTML = `<div style="color: red;">加载角色数据失败: ${error.message}</div>`;

      // 添加文件选择器作为备选方案
      addFileSelector();
    }
  }

  // 添加文件选择器作为备选方案
  function addFileSelector() {
    const list = document.getElementById('character-list');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.marginTop = '10px';

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const characters = JSON.parse(event.target.result);
            displayCharacters(characters);
          } catch (err) {
            list.innerHTML = `<div style="color: red;">JSON解析失败: ${err.message}</div>`;
          }
        };
        reader.readAsText(file);
      }
    });

    const prompt = document.createElement('div');
    prompt.style.marginBottom = '10px';
    prompt.textContent = '请选择角色数据文件(characters.json):';

    list.appendChild(prompt);
    list.appendChild(fileInput);
  }

  // 修改HTML转文本的函数，移除所有换行
  function htmlToText(html) {
    // 移除<div>标签但保留其中的换行
    html = html.replace(/<\/?div>/g, '\n\n');  // 改为两个换行符以确保段落间空行

    // 移除所有链接标签但保留文本
    html = html.replace(/<a[^>]*>(.*?)<\/a>/g, '$1');

    // 将<br/>替换为换行符
    html = html.replace(/<br\s*\/?>/g, '\n');

    // 移除其他HTML标签
    const temp = document.createElement('div');
    temp.innerHTML = html;
    let text = temp.textContent || temp.innerText || '';

    // 处理连续换行:
    // 1. 将3个以上的连续\n替换为两个\n（保留段落间的空行）
    // 2. 移除每行开头和结尾的空格
    text = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)  // 移除空行
      .join('\n')
      .replace(/\n{3,}/g, '\n\n');  // 将多个连续换行替换为两个换行

    return text;
  }

  // 添加已完成角色的存储管理
  const COMPLETED_CHARS_KEY = 'completed_characters';

  function getCompletedCharacters() {
    const saved = localStorage.getItem(COMPLETED_CHARS_KEY);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  }

  function markCharacterCompleted(id) {
    const completed = getCompletedCharacters();
    completed.add(id);
    localStorage.setItem(COMPLETED_CHARS_KEY, JSON.stringify([...completed]));
  }

  function unmarkCharacterCompleted(id) {
    const completed = getCompletedCharacters();
    completed.delete(id);
    localStorage.setItem(COMPLETED_CHARS_KEY, JSON.stringify([...completed]));
  }

  // 修改displayCharacters函数
  async function displayCharacters(characters) {
    console.log('Displaying characters:', characters);
    const list = document.getElementById('character-list');
    list.innerHTML = '';
    list.style.margin = '0 auto'; // 居中显示

    if (!characters || Object.keys(characters).length === 0) {
      list.innerHTML = '<div>没有找到角色数据</div>';
      return;
    }

    // 获取已完成的角色列表
    const completedChars = getCompletedCharacters();

    // 对角色进行排序：未完成的在前，已完成的在后
    const sortedEntries = Object.entries(characters).sort(([id1], [id2]) => {
      const completed1 = completedChars.has(id1);
      const completed2 = completedChars.has(id2);
      if (completed1 === completed2) {
        return parseInt(id1) - parseInt(id2);
      }
      return completed1 ? 1 : -1;
    });

    sortedEntries.forEach(([id, char]) => {
      const item = document.createElement('div');
      item.className = 'character-item';
      const isCompleted = completedChars.has(id);
      item.style.cssText = `
            display: flex;
            align-items: center;
            padding: 10px;
            border: 1px solid #eee;
            border-radius: 3px;
            margin-bottom: 5px;
            background: ${isCompleted ? '#f8f8f8' : 'white'};
        `;

      // 左侧容器：头像和名称
      const leftContainer = document.createElement('div');
      leftContainer.style.cssText = `
            display: flex;
            align-items: center;
            flex-grow: 1;
        `;

      if (char.avatar && imageCache.has(char.avatar)) {
        const avatar = document.createElement('img');
        avatar.src = imageCache.get(char.avatar);
        avatar.style.cssText = `
                width: 48px;
                height: 48px;
                margin-right: 10px;
                object-fit: cover;
                border-radius: 3px;
            `;
        leftContainer.appendChild(avatar);
      } else {
        const placeholder = document.createElement('div');
        placeholder.style.cssText = `
                width: 48px;
                height: 48px;
                margin-right: 10px;
                background: #eee;
                border-radius: 3px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #999;
                font-size: 12px;
            `;
        placeholder.textContent = '暂无';
        leftContainer.appendChild(placeholder);
      }

      const name = document.createElement('span');
      name.textContent = char.name || '未知角色';
      leftContainer.appendChild(name);

      // 按钮容器
      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = `
            display: flex;
            gap: 8px;
            margin-left: 15px;
        `;

      // 完成按钮
      const completeButton = document.createElement('button');
      completeButton.textContent = isCompleted ? '✓' : '○';
      completeButton.style.cssText = `
            padding: 4px 8px;
            background: ${isCompleted ? '#4CAF50' : '#ddd'};
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            min-width: 32px;
            &:hover {
                background: ${isCompleted ? '#45a049' : '#ccc'};
            }
        `;
      completeButton.addEventListener('click', () => {
        if (isCompleted) {
          unmarkCharacterCompleted(id);
        } else {
          markCharacterCompleted(id);
        }
        // 重新显示列表
        displayCharacters(characters);
      });

      // 性别按钮
      const maleButton = document.createElement('button');
      maleButton.textContent = '男';
      maleButton.style.cssText = `
            padding: 4px 12px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            &:hover {
                background: #45a049;
            }
        `;
      maleButton.addEventListener('click', () => {
        fillCharacterForm(char, id, '男');
      });

      const femaleButton = document.createElement('button');
      femaleButton.textContent = '女';
      femaleButton.style.cssText = `
            padding: 4px 12px;
            background: #FF69B4;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            &:hover {
                background: #FF1493;
            }
        `;
      femaleButton.addEventListener('click', () => {
        fillCharacterForm(char, id, '女');
      });

      // 来源按钮
      const sourceButton = document.createElement('button');
      sourceButton.textContent = '来源';
      sourceButton.style.cssText = `
            padding: 4px 12px;
            background: #6d93c4;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            &:hover {
                background: #5a7ba8;
            }
        `;
      sourceButton.addEventListener('click', () => {
        window.open(`http://w.atwiki.jp/moshimorpg/pages/${id}.html`, '_blank');
      });

      buttonContainer.appendChild(completeButton);
      buttonContainer.appendChild(maleButton);
      buttonContainer.appendChild(femaleButton);
      buttonContainer.appendChild(sourceButton);

      item.appendChild(leftContainer);
      item.appendChild(buttonContainer);
      list.appendChild(item);
    });
  }

  // 文件夹选择器UI创建函数
  function createFolderSelector(list, characters) {
    const folderSelector = document.createElement('div');
    folderSelector.style.cssText = `
        padding: 20px;
        text-align: center;
        border: 2px dashed #ddd;
        border-radius: 8px;
        margin-bottom: 15px;
    `;

    const promptText = document.createElement('p');
    promptText.textContent = '请选择角色头像文件夹';
    promptText.style.marginBottom = '10px';

    const selectButton = document.createElement('button');
    selectButton.textContent = '选择文件夹';
    selectButton.style.cssText = `
        padding: 8px 16px;
        background: #4CAF50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    `;

    const folderInput = document.createElement('input');
    folderInput.type = 'file';
    folderInput.webkitdirectory = true;
    folderInput.directory = true;
    folderInput.multiple = true;
    folderInput.style.display = 'none';

    const progressDiv = document.createElement('div');
    progressDiv.style.marginTop = '10px';
    folderSelector.appendChild(progressDiv);

    selectButton.addEventListener('click', () => {
      folderInput.click();
    });

    folderInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      console.log('Selected files:', files);
      progressDiv.textContent = '开始加载图片...';

      try {
        // 加载并缓存图片
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file.type.startsWith('image/')) {
            await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = (event) => {
                imageCache.set(file.name, event.target.result);
                progressDiv.textContent = `正在加载图片: ${i + 1}/${files.length}`;
                resolve();
              };
              reader.readAsDataURL(file);
            });
          }
        }

        // 保存到IndexedDB
        try {
          await saveImagesToDB(imageCache);
          console.log('Images saved to IndexedDB:', imageCache.size);
          progressDiv.textContent = '图片加载完成并已保存！';
        } catch (dbError) {
          console.error('Error saving to IndexedDB:', dbError);
          progressDiv.textContent = '保存到数据库时出错：' + dbError.message;
        }

        // 显示角色列表
        setTimeout(() => displayCharacterList(characters), 500);
      } catch (error) {
        console.error('Error processing images:', error);
        progressDiv.textContent = '加载图片时出错：' + error.message;
      }
    });

    folderSelector.appendChild(promptText);
    folderSelector.appendChild(selectButton);
    folderSelector.appendChild(folderInput);
    list.appendChild(folderSelector);
  }

  // 角色列表显示函数
  function displayCharacterList(characters) {
    const list = document.getElementById('character-list');
    list.innerHTML = '';

    if (!characters || Object.keys(characters).length === 0) {
      list.innerHTML = '<div>没有找到角色数据</div>';
      return;
    }

    // 创建文件夹选择界面
    const folderSelector = document.createElement('div');
    folderSelector.style.cssText = `
        padding: 20px;
        text-align: center;
        border: 2px dashed #ddd;
        border-radius: 8px;
        margin-bottom: 15px;
    `;

    const promptText = document.createElement('p');
    promptText.textContent = '请选择角色头像文件夹';
    promptText.style.marginBottom = '10px';

    const selectButton = document.createElement('button');
    selectButton.textContent = '选择文件夹';
    selectButton.style.cssText = `
        padding: 8px 16px;
        background: #4CAF50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        &:hover {
            background: #45a049;
        }
    `;

    const folderInput = document.createElement('input');
    folderInput.type = 'file';
    folderInput.webkitdirectory = true;
    folderInput.directory = true;
    folderInput.multiple = true;
    folderInput.style.display = 'none';

    selectButton.addEventListener('click', () => {
      folderInput.click();
    });

    folderInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      console.log('Selected files:', files);

      // 显示加载进度
      const progressDiv = document.createElement('div');
      progressDiv.style.marginTop = '10px';
      folderSelector.appendChild(progressDiv);

      // 加载所有图片
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          await new Promise((resolve) => {
            reader.onload = (event) => {
              const fileName = file.name;
              imageCache.set(fileName, event.target.result);
              progressDiv.textContent = `正在加载图片: ${i + 1}/${files.length}`;
              resolve();
            };
            reader.readAsDataURL(file);
          });
        }
      }

      // 显示角色列表
      list.innerHTML = '';
      Object.entries(characters).forEach(([id, char]) => {
        const item = document.createElement('div');
        item.className = 'character-item';
        item.style.cssText = `
            display: flex;
            align-items: center;
            padding: 5px;
            border: 1px solid #eee;
            border-radius: 3px;
            margin-bottom: 5px;
        `;

        // 左侧容器：头像和名称
        const leftContainer = document.createElement('div');
        leftContainer.style.cssText = `
            display: flex;
            align-items: center;
            flex-grow: 1;
        `;

        if (char.avatar && imageCache.has(char.avatar)) {
          const avatar = document.createElement('img');
          avatar.src = imageCache.get(char.avatar);
          avatar.style.cssText = `
            width: 48px;
            height: 48px;
            margin-right: 10px;
            object-fit: cover;
            border-radius: 3px;
          `;
          leftContainer.appendChild(avatar);
        } else {
          const placeholder = document.createElement('div');
          placeholder.style.cssText = `
            width: 48px;
            height: 48px;
            margin-right: 10px;
            background: #eee;
            border-radius: 3px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #999;
            font-size: 12px;
          `;
          placeholder.textContent = '暂无';
          leftContainer.appendChild(placeholder);
        }

        const name = document.createElement('span');
        name.textContent = char.name || '未知角色';
        leftContainer.appendChild(name);

        // 按钮容器
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
          display: flex;
          gap: 5px;
          margin-left: 10px;
        `;

        // 性别按钮
        const maleButton = document.createElement('button');
        maleButton.textContent = '男';
        maleButton.style.cssText = `
          padding: 4px 8px;
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 3px;
          cursor: pointer;
          &:hover {
            background: #45a049;
          }
        `;
        maleButton.addEventListener('click', () => {
          fillCharacterForm(char, id, '男');
        });

        const femaleButton = document.createElement('button');
        femaleButton.textContent = '女';
        femaleButton.style.cssText = `
          padding: 4px 8px;
          background: #FF69B4;
          color: white;
          border: none;
          border-radius: 3px;
          cursor: pointer;
          &:hover {
            background: #FF1493;
          }
        `;
        femaleButton.addEventListener('click', () => {
          fillCharacterForm(char, id, '女');
        });

        // 来源按钮
        const sourceButton = document.createElement('button');
        sourceButton.textContent = '来源';
        sourceButton.style.cssText = `
          padding: 4px 8px;
          background: #6d93c4;
          color: white;
          border: none;
          border-radius: 3px;
          cursor: pointer;
          &:hover {
            background: #5a7ba8;
          }
        `;
        sourceButton.addEventListener('click', (e) => {
          e.stopPropagation();
          window.open(`http://w.atwiki.jp/moshimorpg/pages/${id}.html`, '_blank');
        });

        buttonContainer.appendChild(maleButton);
        buttonContainer.appendChild(femaleButton);
        buttonContainer.appendChild(sourceButton);

        item.appendChild(leftContainer);
        item.appendChild(buttonContainer);
        list.appendChild(item);
      });
    });

    folderSelector.appendChild(promptText);
    folderSelector.appendChild(selectButton);
    folderSelector.appendChild(folderInput);
    list.appendChild(folderSelector);
  }

  // 过滤角色列表
  function filterCharacters(keyword) {
    const items = document.getElementsByClassName('character-item');
    Array.from(items).forEach(item => {
      const name = item.querySelector('span').textContent;
      item.style.display = name.toLowerCase().includes(keyword.toLowerCase()) ? '' : 'none';
    });
  }

  // 修改图片上传函数，使用正确的文件输入框
  async function uploadImage(imageData) {
    // 查找正确的文件输入框
    const fileInput = document.getElementById('picfile');
    if (!fileInput) {
      console.error('找不到文件输入框#picfile');
      return;
    }

    // 创建文件对象
    const byteString = atob(imageData.split(',')[1]);
    const mimeString = imageData.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: mimeString });
    const file = new File([blob], "avatar.png", { type: mimeString });

    // 创建新的 DataTransfer 对象并添加文件
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;

    // 触发change事件
    const event = new Event('change', { bubbles: true });
    fileInput.dispatchEvent(event);

    // 预览图片
    const imagePreview = document.getElementById('ImagePreview');
    if (imagePreview) {
      imagePreview.src = imageData;
    }
  }

  // 修改填充表单的函数
  async function fillCharacterForm(char, id, gender) {
    // 填充名称
    const nameInput = document.getElementById('crt_name');
    if (nameInput) {
      nameInput.value = char.name || '';
    }

    // 填充简介 - 移除换行
    const summaryInput = document.getElementById('crt_summary');
    if (summaryInput && char.description) {
      summaryInput.value = htmlToText(char.description);
    }

    // 如果有头像，自动上传
    if (char.avatar && imageCache.has(char.avatar)) {
      try {
        await uploadImage(imageCache.get(char.avatar));
      } catch (error) {
        console.error('上传头像失败:', error);
      }
    }

    // 填充infobox
    let infobox = `{{Infobox Crt
|简体中文名=${char.name || ''}`;

    // 添加性别（默认为男）
    infobox += `\n|性别=${gender || ''}`;

    // 添加昵称
    if (char.nickName && char.nickName.length > 0) {
      infobox += '\n|别名={\n';
      char.nickName.forEach(nick => {
        infobox += `[${nick}]\n`;
      });
      infobox += '}';
    }

    // 添加引用来源
    infobox += `\n|引用来源={\n[http://w.atwiki.jp/moshimorpg/pages/${id}.html]\n}`;

    infobox += '\n}}';

    // 切换到Wiki模式并填充
    const wikiModeButton = document.querySelector('a[onclick="NormaltoWCODE()"]');
    if (wikiModeButton) {
      wikiModeButton.click();
    }

    // 等待一小段时间确保切换完成
    await new Promise(resolve => setTimeout(resolve, 100));

    const infoboxInput = document.getElementById('subject_infobox');
    if (infoboxInput) {
      infoboxInput.value = infobox;
    }
  }

  // 修改初始化函数
  async function init() {
    console.log('Initializing character creator helper...');
    createSidePanel();

    try {
      // 初始化数据库
      await initDB();
      // 尝试从IndexedDB加载图片
      imageCache = await loadImagesFromDB();
      console.log('Loaded images from IndexedDB:', imageCache.size);
    } catch (error) {
      console.error('Error loading from IndexedDB:', error);
      imageCache = new Map();
    }

    // 加载角色数据
    loadCharacterData();
  }

  // 替换原有的初始化代码
  init();
})(); 