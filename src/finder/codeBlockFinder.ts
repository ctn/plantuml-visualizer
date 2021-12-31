import { Constants } from '../constants';
import { INCLUDE_REGEX, INCLUDESUB_REGEX } from '../directiveRegexes';

import type { CodeFinder, UmlCodeContent } from './finder';
import { extractSubIncludedText } from './finderUtil';

export class CodeBlockFinder implements CodeFinder {
  private readonly URL_REGEX = /^(file|https?):\/\/.+$/;

  canFind(webPageUrl: string): boolean {
    return this.URL_REGEX.test(webPageUrl);
  }

  async find(webPageUrl: string, $root: JQuery<Node>): Promise<UmlCodeContent[]> {
    const $texts = $root.find(`pre:not([${Constants.ignoreAttribute}])`);
    const result = [];
    for (let i = 0; i < $texts.length; i++) {
      const $text = $texts.eq(i);
      let content = $text.text().trim();
      if (!Constants.startPattern.test(content) || !Constants.endPattern.test(content)) continue;
      content = await this.preprocessIncludeDirective(webPageUrl, content);
      content = await this.preprocessIncludesubDirective(webPageUrl, content);
      result.push({ $text, text: content });
    }

    // Now look inside tables, which is where GitHub displays code
    await this.findInTables(webPageUrl, $root, result);

    return result;
  }

  /**
   * This is designed to work with GitHub source code, which is laid out as table rows.
   */
  private async findInTables(webPageUrl: string, $root: JQuery<Node>, result: any[]): Promise<UmlCodeContent[]> {
    const $tables = $root.find(`table:not([${Constants.ignoreAttribute}])`);

    for (let i = 0; i < $tables.length; i++) {
      const $table = $tables.eq(i);
      const $rows = $table.find(`tr:not([${Constants.ignoreAttribute}])`);
      for (let j = 0; j < $rows.length; j++) {
        let $row = $rows.eq(j);
        let content = $row.text().trim();

        if (!Constants.startPattern.test(content)) continue;

        do {
          content += '\n' + $row.text().trim();
          $row.remove();
          $row = $rows.eq(++j);
        } while (!Constants.endPattern.test(content));

        content = await this.preprocessIncludeDirective(webPageUrl, content);
        content = await this.preprocessIncludesubDirective(webPageUrl, content);
        const $div = $row.children().last().append('<div></div>');
        result.push({ $text: $div, text: content });
      }
    }

    return result;
  }

  private async preprocessIncludeDirective(webPageUrl: string, content: string): Promise<string> {
    const contentLines = content.split('\n');
    const dirUrl = webPageUrl.replace(/\/[^/]*\.(plantuml|pu|puml|wsd)(\?.*)?$/, '');

    const preprocessedLines = [];
    for (const line of contentLines) {
      const match = INCLUDE_REGEX.exec(line);
      if (!match) {
        preprocessedLines.push(line);
        continue;
      }

      const includedFileUrl = `${dirUrl}/${match[1]}`;
      const response = await fetch(includedFileUrl);
      if (!response.ok) {
        continue;
      }
      let text = await response.text();
      text = await this.preprocessIncludeDirective(includedFileUrl, text);
      text = await this.preprocessIncludesubDirective(includedFileUrl, text);
      const includedText = text.replace(/@startuml/g, '').replace(/@enduml/g, '');
      preprocessedLines.push(includedText);
    }

    return preprocessedLines.join('\n');
  }

  private async preprocessIncludesubDirective(webPageUrl: string, content: string): Promise<string> {
    const contentLines = content.split('\n');
    const dirUrl = webPageUrl.replace(/\/[^/]*\.(plantuml|pu|puml|wsd)(\?.*)?$/, '');

    const preprocessedLines = [];
    for (const line of contentLines) {
      const match = INCLUDESUB_REGEX.exec(line);
      if (!match) {
        preprocessedLines.push(line);
        continue;
      }

      const includedFileUrl = `${dirUrl}/${match[1]}`;
      const response = await fetch(includedFileUrl);
      if (!response.ok) {
        continue;
      }
      let text = await response.text();
      text = await this.preprocessIncludeDirective(includedFileUrl, text);
      text = await this.preprocessIncludesubDirective(includedFileUrl, text);
      const includedText = extractSubIncludedText(text, match[3]);
      preprocessedLines.push(includedText);
    }

    return preprocessedLines.join('\n');
  }
}
