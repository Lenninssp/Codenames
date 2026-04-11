export class Hint {
  private word: string;
  private count: number;

  public constructor(word: string, count: number) {
    this.word = word;
    this.count = count;
  }

  public getWord(): string {
    return this.word;
  }

  public getCount(): number {
    return this.count;
  }
}
