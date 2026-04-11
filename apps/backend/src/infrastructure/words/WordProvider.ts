export interface WordProvider {
  fetchRandomWords(count: number): string[];
}
