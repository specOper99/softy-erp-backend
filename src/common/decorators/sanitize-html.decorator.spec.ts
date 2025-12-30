import { plainToInstance } from 'class-transformer';
import { SanitizeHtml } from './sanitize-html.decorator';

class TestDto {
  @SanitizeHtml()
  content: string;

  @SanitizeHtml({ allowedTags: ['b'] })
  restrictedContent: string;
}

describe('SanitizeHtml Decorator', () => {
  it('should sanitize HTML keeping default safe tags', () => {
    const input = {
      content: '<p>Hello <script>alert("xss")</script><b>World</b></p>',
    };
    const result = plainToInstance(TestDto, input);

    expect(result.content).toBe('<p>Hello <b>World</b></p>');
    expect(result.content).not.toContain('<script>');
  });

  it('should ignore non-string values', () => {
    const input = { content: 123 };
    const result = plainToInstance(TestDto, input);
    expect(result.content).toBe(123);
  });

  it('should respect custom options', () => {
    const input = { restrictedContent: '<p>Hello <b>World</b></p>' };
    const result = plainToInstance(TestDto, input);
    expect(result.restrictedContent).toBe('Hello <b>World</b>');
  });

  it('should handle null/undefined gracefully', () => {
    const input = { content: null };
    const result = plainToInstance(TestDto, input);
    expect(result.content).toBeNull();
  });
});
