import { isLang } from '../../resources/languages';
import UserConfig from '../../resources/user_config';

UserConfig.registerOptions('general', {
  options: [
    {
      id: 'CactbotUserDirectory',
      name: {
        en: 'Cactbot user directory',
        de: 'Cactbot Benutzerverzeichnis',
        fr: 'Répertoire utilisateur de Cactbot',
        ja: 'Cactbot ユーザーディレクトリ',
        cn: 'Cactbot user目录',
        ko: 'Cactbot 사용자 디렉토리',
        tc: 'Cactbot user目錄',
      },
      type: 'directory',
      default: '',
    },
    {
      id: 'ShowDeveloperOptions',
      name: {
        en: 'Show developer options',
        de: 'Zeige Entwickleroptionen',
        fr: 'Afficher les options développeur',
        ja: '開発者向けオプション',
        cn: '显示开发者选项',
        ko: '개발자 옵션 표시',
        tc: '顯示開發者選項',
      },
      type: 'checkbox',
      default: false,
    },
    {
      id: 'DisplayLanguage',
      name: {
        en: 'Display language',
        de: 'Displaysprache',
        fr: 'Langue d\'affichage',
        ja: '表示言語',
        cn: '显示语言',
        ko: '주 사용 언어',
        tc: '顯示語言',
      },
      type: 'select',
      options: {
        en: {
          'Use FFXIV Plugin Language': 'default',
          'English (en)': 'en',
          'Chinese (cn)': 'cn',
          'German (de)': 'de',
          'French (fr)': 'fr',
          'Japanese (ja)': 'ja',
          'Korean (ko)': 'ko',
          'Traditional Chinese (tc)': 'tc',
        },
        de: {
          'Benutze FFXIV Plugin Sprache': 'default',
          'Englisch (en)': 'en',
          'Chinesisch (cn)': 'cn',
          'Deutsch (de)': 'de',
          'Französisch (fr)': 'fr',
          'Japanisch (ja)': 'ja',
          'Koreanisch (ko)': 'ko',
          'Traditionelles Chinesisch (tc)': 'tc',
        },
        fr: {
          'Utiliser la langue du Plugin FFXIV': 'default',
          'Anglais (en)': 'en',
          'Chinois (cn)': 'cn',
          'Allemand (de)': 'de',
          'Français (fr)': 'fr',
          'Japonais (ja)': 'ja',
          'Coréen (ko)': 'ko',
          'Chinois traditionnel (tc)': 'tc',
        },
        ja: {
          'FFXIV Pluginの言語設定': 'default',
          '英語 (en)': 'en',
          '中国語 (cn)': 'cn',
          'ドイツ語 (de)': 'de',
          'フランス語 (fr)': 'fr',
          '日本語 (ja)': 'ja',
          '韓国語 (ko)': 'ko',
          '繁体字中国語 (tc)': 'tc',
        },
        cn: {
          '使用最终幻想XIV解析插件设置的语言': 'default',
          '英文 (en)': 'en',
          '中文 (cn)': 'cn',
          '德文 (de)': 'de',
          '法文 (fr)': 'fr',
          '日文 (ja)': 'ja',
          '韩文 (ko)': 'ko',
          '繁体中文 (tc)': 'tc',
        },
        ko: {
          'FFXIV Plugin 언어 사용': 'default',
          '영어 (en)': 'en',
          '중국어 (cn)': 'cn',
          '독일어 (de)': 'de',
          '프랑스어 (fr)': 'fr',
          '일본어 (ja)': 'ja',
          '한국어 (ko)': 'ko',
          '중국어 번체 (tc)': 'tc',
        },
        tc: {
          '使用最終幻想XIV解析插件設置的語言': 'default',
          '英文 (en)': 'en',
          '中文 (cn)': 'cn',
          '德文 (de)': 'de',
          '法文 (fr)': 'fr',
          '日文 (ja)': 'ja',
          '韓文 (ko)': 'ko',
          '繁體中文 (tc)': 'tc',
        },
      },
      default: 'default',
      debug: true,
      setterFunc: (value) => {
        if (typeof value !== 'string')
          return;
        if (value === 'default')
          return;
        if (isLang(value))
          return value;
      },
    },
    // Fork: the new config page, or the original one (see config_tabs.ts).
    {
      id: 'ConfigStyle',
      name: {
        en: 'Config page style',
        ko: '설정 화면 스타일',
      },
      type: 'select',
      options: {
        en: {
          'New': 'modern',
          'Original cactbot': 'classic',
        },
        ko: {
          '새 디자인': 'modern',
          '예전 cactbot 화면': 'classic',
        },
      },
      default: 'modern',
    },
    // Fork: the config page's theme (see config_tabs.ts).
    {
      id: 'ConfigTheme',
      name: {
        en: 'Config page theme',
        ko: '설정 화면 테마',
      },
      type: 'select',
      options: {
        en: {
          'Dark': 'dark',
          'Light': 'light',
          'Follow Windows': 'system',
        },
        ko: {
          '다크': 'dark',
          '라이트': 'light',
          'Windows 설정 따르기': 'system',
        },
      },
      default: 'dark',
      // The original page has one look.
      hidden: (values) => values['ConfigStyle'] === 'classic',
    },
    // Fork: the config page's scale (also Ctrl+wheel there; see config_tabs.ts).
    {
      id: 'ConfigZoom',
      name: {
        en: 'Config page scale',
        ko: '설정 화면 배율',
      },
      type: 'select',
      options: {
        en: {
          '80%': '0.8',
          '90%': '0.9',
          '100%': '1',
          '110%': '1.1',
          '125%': '1.25',
          '150%': '1.5',
          '175%': '1.75',
          '200%': '2',
        },
      },
      default: '1',
    },
  ],
});
