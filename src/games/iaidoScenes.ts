// Иайдо: сцены (фоны картины). Сцена задаётся в задании — так у каждой префектуры свой фон.
import type { IaiSceneId } from '../shared/types';
import moonUrl from '../img/iaido/bg.png';
import dawnUrl from '../img/iaido/bg_dawn.png';
import bambooUrl from '../img/iaido/bg_bamboo.png';
import bridgeUrl from '../img/iaido/bg_bridge.png';

export const IAI_SCENES: Record<IaiSceneId, { name: string; url: string }> = {
  moon: { name: 'Ночная сакура и Фудзи', url: moonUrl },
  dawn: { name: 'Рассвет у стен замка', url: dawnUrl },
  bamboo: { name: 'Бамбуковая роща под дождём', url: bambooUrl },
  bridge: { name: 'Мост в ночном городе', url: bridgeUrl },
};

export const iaiBg = (scene?: IaiSceneId) => (IAI_SCENES[scene ?? 'moon'] ?? IAI_SCENES.moon).url;
