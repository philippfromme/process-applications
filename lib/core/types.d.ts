import { VFile } from 'vfile';

import { Position, Point } from 'unist';
import { Node as UnistNode } from 'unist';

import { Root, Content, Heading, Definition } from 'mdast';

export type Node = (Content|Root) & UnistNode;

export type DocumentRef = {
  uri?: string,
  position: Position,
  value?: string
};

export type File = VFile;

export type TaggedRoot = Root & {
  anchors: DocumentRef[],
  links: DocumentRef[],
  tags: DocumentRef[]
};

export type Positioned = {
  uri: string,
  position: Position
};

export interface IndexItem extends Record<string, any> {
  uri: string,
  value?: string,
  version?: number,
  localValue?: string,
  file: File,
  parseTree?: Root
}

export {
  Root,
  Heading,
  Definition,
  Position,
  Point
};
