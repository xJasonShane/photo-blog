import LoaderButton from '@/components/primitives/LoaderButton';
import { clsx } from 'clsx/lite';
import { ComponentProps } from 'react';
import { BiTrash } from 'react-icons/bi';

export default function DeleteButton({
  className,
  ...rest
}: ComponentProps <typeof LoaderButton>) {
  return (
    <LoaderButton
      {...rest}
      title="Delete"
      icon={<BiTrash size={16} />}
      spinnerColor="text"
      className={clsx('error', className)}
    />
  );
}
