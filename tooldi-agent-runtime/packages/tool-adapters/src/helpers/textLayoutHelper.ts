export interface TextLayoutEstimate {
  width: number;
  height: number;
  estimatedLineCount: number;
}

export interface TextLayoutHelper {
  estimate(input: {
    text: string;
    maxWidth: number;
  }): Promise<TextLayoutEstimate>;
}

class PlaceholderTextLayoutHelper implements TextLayoutHelper {
  async estimate(input: {
    text: string;
    maxWidth: number;
  }): Promise<TextLayoutEstimate> {
    const estimatedLineCount = Math.max(1, Math.ceil(input.text.length / 24));
    return {
      width: input.maxWidth,
      height: estimatedLineCount * 72,
      estimatedLineCount,
    };
  }
}

export function createTextLayoutHelper(): TextLayoutHelper {
  return new PlaceholderTextLayoutHelper();
}
