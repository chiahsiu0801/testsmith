import { format } from '@/utils/format';
import type { ButtonProps } from '../lib/types';

export function Button({ label }: ButtonProps) {
  return <button>{format(label)}</button>;
}
