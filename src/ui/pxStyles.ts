// Preact 11 больше не дописывает «px» к числам в style (осталось только в preact/compat):
// style={{ width: 96 }} молча игнорировался. Возвращаем старое поведение для всех страниц.
import { options } from 'preact';

const NON_DIMENSIONAL = /^(-|f[lo].*[^se]$|g.{5,}[^ps]$|z|o[pr]|(W.{5})?[lL]i.*(t|mp)$|an|(bo|s).{4}Im|sca|m.{6}[ds]|ta|c.*[st]$|wido|ini)/;

const prev = options.vnode;
options.vnode = (vnode: any) => {
  const style = vnode.props?.style;
  if (style && typeof style === 'object') {
    for (const k in style) {
      if (typeof style[k] === 'number' && !NON_DIMENSIONAL.test(k)) style[k] = style[k] + 'px';
    }
  }
  prev?.(vnode);
};
