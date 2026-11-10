// Картинки машин и эмблем автосалонов (иконки src/img/icons/car_<id>.png, emb_<id>.png).
import type { CarId } from '../shared/cars';
import { pixelIconUrl } from '../shared/sprites';

export const carUrl = (id: CarId, scale = 3) => pixelIconUrl('car_' + id, scale);
export const embUrl = (id: CarId, scale = 3) => pixelIconUrl('emb_' + id, scale);
