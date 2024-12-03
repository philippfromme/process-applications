/**
 * @typedef { import('./types').Position } Position
 * @typedef { import('./types').Positioned } Positioned
 * @typedef { import('./types').IndexItem } IndexItem
 *
 * @typedef { import('./types').DocumentRange } DocumentRange
 *
 * @typedef { {
 *   uri: string,
 *   value: string,
 *   anchors: DocumentRange[],
 *   links: DocumentRange[],
 *   tags: DocumentRange[]
 * } } Document
 *
 * @typedef { {
 *   uri: string,
 *   targetUri: string,
 *   position: Position
 * } } BaseLink
 *
 * @typedef { {
 *   uri: string,
 *   position: Position
 * } } BaseAnchor
 *
 * @typedef { BaseAnchor & { references: Set<Link> } } Anchor
 *
 * @typedef { BaseLink & { anchor?: Anchor } } Link
 */

import { URL } from 'node:url';

import {
  inRange
} from './util.js';

function countEntriesByType(map, typeValue) {
  return new Map([...map].filter(([_, value]) => value.parsedValue.type === typeValue)).size;
}

function getEntriesOfType(map, typeValue) {
  return new Map([...map].filter(([_, value]) => value.parsedValue.type === typeValue));
}

/**
 * A references holder.
 */
export default class References {

  /**
   * @type { Map<string, Resource> }
   */
  resourcesById = new Map();

  processIds = new Set();
  processIdsByResource = new Map();
  processIdsByTarget = new Map();

  /**
   * @type { Set<DocumentRange> }
   */
  anchors = new Set();

  /**
   * @type { Map<string, Set<DocumentRange>> }
   */
  anchorsByDocument = new Map();

  /**
   * @type { Map<string, DocumentRange> }
   */
  anchorsByUri = new Map();

  /**
   * @type { Map<string, Set<DocumentRange>> }
   */
  tags = new Map();

  /**
   * @type { Map<string, Set<DocumentRange>> }
   */
  tagsByDocument = new Map();

  /**
   * @type { Set<DocumentRange> }
   */
  links = new Set();

  /**
   * @type { Map<string, Set<DocumentRange>> }
   */
  linksByDocument = new Map();

  /**
   * @type { Map<string, Set<DocumentRange>> }
   */
  linksByTarget = new Map();

  /**
   * @param { import('./logger').default } logger
   * @param { import('node:events').EventEmitter } eventBus
   */
  constructor(logger, eventBus) {
    this._logger = logger;
    this._eventBus = eventBus;

    eventBus.on('indexer:updated', (item) => {

      try {
        this.addResource(item.uri, item);
      } catch (err) {
        this._logger.log('references :: failed to process ' + item.uri, err);
      }
    });

    eventBus.on('indexer:removed', (item) => {
      this.removeDocument(item.uri);
    });

    eventBus.on('references:changed', () => {

      this._logger.log('references :: changed', {
        resources: {
          bpmn: countEntriesByType(this.resourcesById, 'bpmn'),
          dmn: countEntriesByType(this.resourcesById, 'dmn'),
          form: countEntriesByType(this.resourcesById, 'form')
        },
        // links: this.links.size,
        // anchors: this.anchors.size,
        // tags: this.tags.size
      });
    });

  }

  /**
   * @internal
   */
  _changed() {
    clearTimeout(this._changedTimer);

    this._changedTimer = setTimeout(() => {
      this._eventBus.emit('references:changed');
    }, 300);

  }

  /**
   * @param { string } uri
   * @param { IndexItem } item
   */
  addResource(uri, item) {
    this._logger.log('references :: addResource', uri);

    this.removeDocument(uri);

    this.resourcesById.set(uri, item);

    // for (const tag of tags) {

    //   this._addTag({
    //     ...tag,
    //     uri: resourceUri
    //   });
    // }

    // for (const anchor of anchors) {

    //   const {
    //     uri
    //   } = anchor;

    //   this._addAnchor({
    //     ...anchor,
    //     uri: resolve(uri, resourceUri)
    //   });
    // }

    // for (const link of links) {
    //   const {
    //     targetUri
    //   } = link;

    //   this._addLink({
    //     ...link,
    //     uri: resourceUri,
    //     targetUri: resolve(targetUri, resourceUri)
    //   });
    // }

    this._changed();
  }

  /**
   * @internal
   *
   * @param {BaseTag} baseTag
   */
  _addTag(baseTag) {

    const {
      uri: documentUri,
      value: name,
      position
    } = baseTag;

    let tag = this.tags.get(name);

    if (!tag) {
      tag = {
        name,
        references: new Set()
      };

      this.tags.set(name, tag);
    }

    const tagRef = {
      uri: documentUri,
      position,
      tag
    };

    tag.references.add(tagRef);

    this._addRef(tagRef, this.tagsByDocument, documentUri);
  }

  /**
   * @internal
   *
   * @param {TagRef} tagRef
   */
  _removeTag(tagRef) {
    this._removeRef(tagRef, this.tagsByDocument, tagRef.uri);

    const tag = tagRef.tag;

    tag.references.delete(tagRef);
  }

  /**
   * @internal
   *
   * @param {BaseLink} baseLink
   */
  _addLink(baseLink) {

    /** @type {Link} */
    const link = {
      ...baseLink,
      anchor: null
    };

    this.links.add(link);

    this._addRef(link, this.linksByTarget, link.targetUri);
    this._addDocRef(link, this.linksByDocument, link.uri);

    const anchor = this.anchorsByUri.get(link.targetUri);

    if (anchor) {
      anchor.references.add(link);
      link.anchor = anchor;
    }
  }

  /**
   * @internal
   *
   * @param {Link} link
   */
  _removeLink(link) {
    this.links.delete(link);

    this._removeRef(link, this.linksByTarget, link.targetUri);
    this._removeDocRef(link, this.linksByDocument, link.uri);

    const anchor = link.anchor;

    if (anchor) {
      anchor.references.delete(link);
      link.anchor = null;
    }
  }

  /**
   * @internal
   *
   * @param { BaseAnchor } baseAnchor
   */
  _addAnchor(baseAnchor) {

    /** @type {Anchor} */
    const anchor = {
      ...baseAnchor,
      references: new Set()
    };

    this.anchors.add(anchor);
    this.anchorsByUri.set(anchor.uri, anchor);

    this._addDocRef(anchor, this.anchorsByDocument, anchor.uri);

    const links = this.linksByTarget.get(anchor.uri);

    if (links) {
      for (const link of links) {
        link.anchor = anchor;
        anchor.references.add(link);
      }
    }
  }

  /**
   * @internal
   *
   * @param { Anchor } anchor
   */
  _removeAnchor(anchor) {

    this.anchors.delete(anchor);
    this.anchorsByUri.delete(anchor.uri);

    this._removeDocRef(anchor, this.anchorsByDocument, anchor.uri);

    for (const link of anchor.references) {
      link.anchor = null;
    }

    anchor.references.clear();
  }

  /**
   * @internal
   *
   * @template T
   * @param { T } ref
   * @param { Map<string, Set<T>> } refsByDocument
   * @param { string } uri
   */
  _addDocRef(ref, refsByDocument, uri) {

    const url = new URL(uri);
    url.search = '';
    url.hash = '';

    const documentUri = url.toString();

    return this._addRef(ref, refsByDocument, documentUri);
  }

  /**
   * @internal
   *
   * @template T
   * @param { T } ref
   * @param { Map<string, Set<T>> } refsByUri
   * @param { string } uri
   */
  _addRef(ref, refsByUri, uri) {

    let refs = refsByUri.get(uri);

    if (!refs) {
      refs = new Set();
      refsByUri.set(uri, refs);
    }

    refs.add(ref);
  }

  /**
   * @internal
   *
   * @template T
   * @param { T } ref
   * @param { Map<string, Set<T>> } refsByDocument
   * @param { string } uri
   */
  _removeDocRef(ref, refsByDocument, uri) {

    const url = new URL(uri);
    url.search = '';
    url.hash = '';

    const documentUri = url.toString();

    return this._removeRef(ref, refsByDocument, documentUri);
  }

  /**
   * @internal
   *
   * @template T
   * @param { T } ref
   * @param { Map<string, Set<T>> } refsByUri
   * @param { string } uri
   */
  _removeRef(ref, refsByUri, uri) {

    let refs = refsByUri.get(uri);

    if (!refs) {
      return;
    }

    refs.delete(ref);
  }

  /**
   * Find references to referenced link _or_ current document.
   *
   * @param { {
   *   id: string,
   *   type: string,
   * } } ref
   *
   * @return {string[]} references
   */
  findReferences(ref) {
    const {
      id,
      type
    } = ref;

    const bpmnResources = getEntriesOfType(this.resourcesById, 'bpmn');

    const references = [];

    for (const [ uri, resource ] of bpmnResources) {
      if (type === 'bpmn' && resource.parsedValue.linkedProcessIds.find(({ processId }) => processId === id)) {
        references.push(resource);
      } else if (type === 'dmn' && resource.parsedValue.linkedDecisionIds.find(({ decisionId }) => decisionId === id)) {
        references.push(resource);
      } else if (type === 'form' && resource.parsedValue.linkedFormIds.find(({ formId }) => formId === id)) {
        references.push(resource);
      }
    }

    return references;
  }

  /**
   * @param {DocumentRange} ref
   *
   * @return {Positioned[]} references
   */
  findDefinitions(ref) {
    const link = this._findRef(this.linksByDocument, ref);

    if (!link) {
      return [];
    }

    if (!link.anchor) {
      return [ {
        uri: link.targetUri
      } ];
    }

    return [
      link.anchor
    ];
  }

  /**
   * @param {string} uri
   */
  removeDocument(uri) {

    if (!this.resourcesById.has(uri)) {
      return;
    }

    const anchors = this.anchorsByDocument.get(uri);

    if (anchors) {
      for (const anchor of anchors) {
        this._removeAnchor(anchor);
      }
    }

    const links = this.linksByDocument.get(uri);

    if (links) {
      for (const link of links) {
        this._removeLink(link);
      }
    }

    const tagRefs = this.tagsByDocument.get(uri);

    if (tagRefs) {
      for (const tagRef of tagRefs) {
        this._removeTag(tagRef);
      }
    }
    this.resourcesById.delete(uri);

    this._changed();
  }


  /**
   * @internal
   *
   * @template T
   *
   * @param { Map<string, Set<T>> } refs
   * @param { DocumentRange } ref
   *
   * @return { T | undefined }
   */
  _findRef(refs, ref) {

    const { uri, position } = ref;

    const potentialRefs = refs.get(uri);

    if (!potentialRefs) {
      return;
    }

    return Array.from(potentialRefs).find(ref => inRange(position, ref.position));
  }

  getAnchors() {
    return Array.from(this.anchors);
  }

  getLinks() {
    return Array.from(this.links);
  }

}


/**
 * @param {string} uri
 * @param {string} baseUri
 *
 * @return {string}
 */
function resolve(uri, baseUri) {
  const url = new URL(uri, baseUri);
  return url.toString();
}
