import os
import json
import requests
from bs4 import BeautifulSoup, Tag
import re
from urllib.parse import urljoin

class CharacterScraper:
    def __init__(self):
        self.base_url = "https://w.atwiki.jp/moshimorpg/pages"
        self.image_folder = "images"
        self.json_file = "characters.json"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        
        # 创建图片保存目录
        if not os.path.exists(self.image_folder):
            os.makedirs(self.image_folder)
            
        # 如果json文件不存在则创建
        if not os.path.exists(self.json_file):
            self.save_characters({})

    def load_characters(self):
        """加载现有的角色数据"""
        try:
            with open(self.json_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return {}

    def save_characters(self, characters):
        """保存角色数据到JSON文件"""
        with open(self.json_file, 'w', encoding='utf-8') as f:
            json.dump(characters, f, ensure_ascii=False, indent=2)

    def download_image(self, image_url, character_name):
        """下载角色头像"""
        try:
            response = requests.get(image_url, headers=self.headers)
            if response.status_code == 200:
                # 获取文件扩展名
                ext = os.path.splitext(image_url)[1]
                if not ext:
                    ext = '.png'  # 默认使用png格式
                    
                # 构建保存路径
                filename = f"{character_name}{ext}"
                filepath = os.path.join(self.image_folder, filename)
                
                # 保存图片
                with open(filepath, 'wb') as f:
                    f.write(response.content)
                return filename
        except Exception as e:
            print(f"下载图片失败: {e}")
        return None

    def clean_text(self, text):
        """清理文本内容"""
        # 移除多余的空白字符
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    def parse_character_page(self, html_content):
        """解析角色页面"""
        soup = BeautifulSoup(html_content, 'html.parser')
        character_data = {}

        # 获取角色名称 - 修改选择器以匹配h2标题
        title_elem = soup.find('h2')
        if not title_elem:
            return None
            
        # 提取角色名称，移除【】中的假名注音
        name_text = title_elem.text
        name_match = re.match(r'([^【]+)(?:【[^】]+】)?', name_text)
        if name_match:
            character_data['name'] = self.clean_text(name_match.group(1))
        else:
            return None

        # 获取头像URL - 查找所有图片
        avatar_found = False
        for img in soup.find_all('img'):
            # 检查图片尺寸是否为48x48
            width = img.get('width')
            height = img.get('height')
            if width == '48' and height == '48':
                image_url = urljoin('https://img.atwiki.jp/moshimorpg/', img['src'])
                character_data['avatar'] = self.download_image(image_url, character_data['name'])
                avatar_found = True
                break
        
        if not avatar_found:
            return None

        # 获取角色简介和昵称
        intro_divs = []
        nicknames = []
        content_div = soup.find('div', id='wikibody')
        if content_div:
            # 找到第一个h2后的下一个h2标签
            next_h2 = None
            found_first_h2 = False
            for elem in content_div.children:
                if elem.name == 'h2':
                    if found_first_h2:
                        next_h2 = elem
                        break
                    found_first_h2 = True
                    continue
                
                if found_first_h2 and not next_h2 and isinstance(elem, Tag):
                    text = elem.get_text(strip=True)
                    if not text:
                        continue
                        
                    # 跳过特定的div
                    if any(class_name in elem.get('class', []) for class_name in [
                        'atwiki-page-tags',
                        'atwiki-page-keyword',
                        'atwiki-lastmodify'
                    ]):
                        continue
                        
                    # 检查是否包含昵称
                    if not intro_divs and elem.name == 'div':
                        first_line = elem.contents[0].strip() if elem.contents else ''
                        if first_line.startswith('（') and first_line.endswith('）'):
                            # 提取昵称
                            nick_text = first_line.strip('（）')
                            nicknames = [n.strip() for n in nick_text.split('、') if n.strip() != '他多数']
                            
                            # 查找行走图后的内容
                            found_walking_sprite = False
                            new_div = BeautifulSoup('<div></div>', 'html.parser').div
                            
                            for content in elem.contents:
                                # 检查是否是行走图
                                if not found_walking_sprite:
                                    if isinstance(content, str):
                                        continue
                                    if content.name == 'picture' or (content.name == 'img' and 'f' in content.get('src', '')):
                                        found_walking_sprite = True
                                        continue
                                # 找到行走图后，开始收集后续内容
                                elif content and str(content).strip():
                                    # 排除picture标签
                                    if isinstance(content, Tag) and content.name == 'picture':
                                        continue
                                    new_div.append(content.string if isinstance(content, str) else content)
                                    
                            if new_div.contents:
                                intro_divs.append(str(new_div))
                        else:
                            # 检查是否是正文div
                            if not elem.get('class') and elem.get_text(strip=True):
                                # 移除picture标签
                                for picture in elem.find_all('picture'):
                                    picture.decompose()
                                intro_divs.append(str(elem))
                    elif elem.name == 'div':
                        # 检查是否是正文div
                        if not elem.get('class') and elem.get_text(strip=True):
                            # 移除picture标签
                            for picture in elem.find_all('picture'):
                                picture.decompose()
                            intro_divs.append(str(elem))
        
        if not intro_divs:
            return None
            
        character_data['description'] = '\n'.join(intro_divs)
        if nicknames:
            character_data['nickName'] = nicknames

        return character_data

    def scrape_characters(self, start_id=1, end_id=500):
        """爬取指定范围内的角色页面"""
        characters = self.load_characters()
        
        for page_id in range(start_id, end_id + 1):
            # 如果ID已存在则跳过
            if str(page_id) in characters:
                print(f"页面 {page_id} 已存在，跳过")
                continue
                
            url = f"{self.base_url}/{page_id}.html"
            try:
                response = requests.get(url, headers=self.headers)
                if response.status_code == 200:
                    character_data = self.parse_character_page(response.text)
                    if character_data:
                        # 添加新角色数据并保存
                        characters[str(page_id)] = character_data
                        self.save_characters(characters)
                        print(f"成功爬取角色: {character_data.get('name', '未知')} (ID: {page_id})")
                    else:
                        print(f"页面 {page_id} 结构不符，跳过")
            except Exception as e:
                print(f"爬取页面 {page_id} 失败: {e}")

if __name__ == "__main__":
    scraper = CharacterScraper()
    scraper.scrape_characters()
