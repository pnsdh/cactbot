import { addOverlayListener } from '../../resources/overlay_plugin_api';
import UserConfig, { UserFileProblem } from '../../resources/user_config';
import { LocaleText } from '../../types/trigger';
import oopsyOptions from '../oopsyraidsy/oopsy_options';
import raidbossOptions from '../raidboss/raidboss_options';

// Fork: the problems of the user files (UserFileProblem) at the top of the config page, as they
// are otherwise only in the OverlayPlugin log.  The page loads raidboss's user files for its
// trigger list; oopsy's are loaded here only for this, and both again when a user file changes
// (the page does not reload for it, see user_config.ts).

const kText = {
  title: {
    en: 'Problems in user files',
    ko: '사용자 파일 문제',
  },
  hint: {
    en: 'A file with an error is skipped. Once it is saved fixed, the overlays load it again ' +
      '(and this list is checked again).',
    ko: '오류가 있는 파일은 적용되지 않습니다. 고쳐서 저장하면 오버레이가 다시 불러오고, 이 목록도 다시 확인합니다.',
  },
  missingDir: {
    en: 'The chosen user directory was not found, the default one is used instead: ${text}',
    ko: '지정한 사용자 폴더가 없어서 기본 폴더를 대신 씁니다: ${text}',
  },
  missingTimeline: {
    en: 'Timeline file not found: ${text}',
    ko: '타임라인 파일이 없습니다: ${text}',
  },
  overwrite: {
    en: 'Replaces Options.${text} that earlier files added to (add with push instead).',
    ko: '앞의 파일들이 추가한 Options.${text}를 통째로 바꿉니다(push로 추가하세요).',
  },
} as const;

const kOverlays: { [overlay: string]: LocaleText } = {
  raidboss: { en: 'Raidboss', ko: '레이드보스' },
  oopsyraidsy: { en: 'Oopsyraidsy', ko: '웁시레이지' },
};

const describe = (problem: UserFileProblem, translate: (text: LocaleText) => string): string =>
  problem.kind === 'error'
    ? problem.text
    : translate(kText[problem.kind]).replace('${text}', problem.text);

export const buildUserFileNotice = (
  container: HTMLElement,
  translate: (text: LocaleText) => string,
): void => {
  const notice = document.createElement('section');
  notice.classList.add('config-user-file-notice');
  notice.hidden = true;
  (container.querySelector('.config-scroll') ?? container).prepend(notice);

  const render = () => {
    const problems = UserConfig.userFileProblems;
    notice.hidden = problems.length === 0;
    const title = document.createElement('div');
    title.classList.add('config-user-file-title');
    title.textContent = translate(kText.title);
    const list = document.createElement('ul');
    for (const problem of problems) {
      const item = document.createElement('li');
      if (problem.overlay !== '') {
        const overlay = document.createElement('span');
        overlay.classList.add('config-user-file-overlay');
        const name = kOverlays[problem.overlay];
        overlay.textContent = name !== undefined ? translate(name) : problem.overlay;
        item.append(overlay);
      }
      if (problem.file !== undefined) {
        const where = document.createElement('code');
        where.textContent = `${problem.file}${problem.at !== undefined ? `:${problem.at}` : ''}`;
        item.append(where);
      }
      const text = document.createElement('span');
      text.textContent = describe(problem, translate);
      item.append(text);
      list.appendChild(item);
    }
    const hint = document.createElement('div');
    hint.classList.add('config-user-file-hint');
    hint.textContent = translate(kText.hint);
    notice.replaceChildren(title, list, hint);
  };
  UserConfig.onUserFileProblem(render);
  render();

  const loadOopsy = () =>
    UserConfig.loadUserFiles(
      'oopsyraidsy',
      { ...oopsyOptions, Triggers: [] },
      () => undefined,
      false,
    );
  loadOopsy();
  addOverlayListener('onUserFileChanged', () => {
    UserConfig.clearUserFileProblems();
    UserConfig.loadUserFiles(
      'raidboss',
      { ...raidbossOptions, Triggers: [] },
      () => undefined,
      false,
    );
    loadOopsy();
  });
};
