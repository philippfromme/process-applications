import BpmnModdle from 'bpmn-moddle';
import DmnModdle from 'dmn-moddle';

import zeebe from 'zeebe-bpmn-moddle/resources/zeebe.json' assert { type: 'json' };

/**
 * @typedef { import('./types.js').IndexItem } IndexItem
 */

export default class Processor {

  constructor() {}

  /**
   * 
   * @param {IndexItem} item 
   *
   * @returns {Promise<any>}
   */
  async process(item) {
    if (!item.value) {
      return null;
    }

    if (item.uri.endsWith('.bpmn') || item.uri.endsWith('.xml')) {
      const { rootElement } = await new BpmnModdle({ zeebe }).fromXML(item.value);

      return {
        type: 'bpmn',
        definitions: rootElement,
        processIds: findProcessIds(rootElement),
        linkedProcessIds: findLinkedProcessIds(rootElement),
        linkedDecisionIds: findLinkedDecisionIds(rootElement),
        linkedFormIds: findLinkedFormIds(rootElement)
      };
    } else if (item.uri.endsWith('dmn')) {
      const { rootElement } = await new DmnModdle().fromXML(item.value);

      return {
        type: 'dmn',
        definitions: rootElement,
        decisionIds: findDecisionIds(rootElement)
      };
    } else if (item.uri.endsWith('form')) {
      const form = JSON.parse(item.value);

      return {
        type: 'form',
        form,
        formId: form.id
      };
    }

    return null;
  }

}

function traverse(element, options) {

  const enter = options.enter || null;
  const leave = options.leave || null;

  const enterSubTree = enter && enter(element);

  const descriptor = element.$descriptor;

  if (enterSubTree !== false && !descriptor.isGeneric) {

    const containedProperties = descriptor.properties.filter(p => {
      return !p.isAttr && !p.isReference && p.type !== 'String';
    });

    containedProperties.forEach(p => {
      if (p.name in element) {
        const propertyValue = element[p.name];

        if (p.isMany) {
          propertyValue.forEach(child => {
            traverse(child, options);
          });
        } else {
          traverse(propertyValue, options);
        }
      }
    });
  }

  leave && leave(element);
}

function findExtensionElement(element, type) {
  return element.extensionElements?.values.find(e => e.$type === type);
}

function findProcessIds(definitions) {
  const processIds = [];

  traverse(definitions, {
    enter(element) {
      if (element.$type === 'bpmn:Process') {
        processIds.push(element.id);
      }
    }
  });

  return processIds;
}

function findDecisionIds(definitions) {
  const decisionIds = [];

  traverse(definitions, {
    enter(element) {
      if (element.$type === 'dmn:Decision') {
        decisionIds.push(element.id);
      }
    }
  });

  return decisionIds;
}

function findLinkedProcessIds(definitions) {
  const linkedProcessIds = [];

  traverse(definitions, {
    enter(element) {
      if (element.$type === 'bpmn:CallActivity') {
        const calledElement = findExtensionElement(element, 'zeebe:CalledElement');

        if (calledElement && calledElement.processId && calledElement.processId.length) {
          linkedProcessIds.push({
            callActivity: element.id,
            processId: calledElement.processId
          });
        }
      }
    }
  });

  return linkedProcessIds;
}

function findLinkedDecisionIds(definitions) {
  const linkedDecisionIds = [];

  traverse(definitions, {
    enter(element) {
      if (element.$type === 'bpmn:BusinessRuleTask') {
        const calledDecision = findExtensionElement(element, 'zeebe:CalledDecision');

        if (calledDecision && calledDecision.decisionId && calledDecision.decisionId.length) {
          linkedDecisionIds.push({
            businessRuleTask: element.id,
            decisionId: calledDecision.decisionId
          });
        }
      }
    }
  });

  return linkedDecisionIds;
}

function findLinkedFormIds(definitions) {
  const linkedFormIds = [];

  traverse(definitions, {
    enter(element) {
      if (element.$instanceOf && element.$instanceOf('bpmn:UserTask')) {
        const formDefinition = findExtensionElement(element, 'zeebe:FormDefinition');

        if (formDefinition && formDefinition.formId && formDefinition.formId.length) {
          linkedFormIds.push({
            userTask: element.id,
            formId: formDefinition.formId
          });
        }
      }
    }
  });

  return linkedFormIds;
}