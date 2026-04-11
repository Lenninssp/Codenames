export class SessionCodeGenerator {
  public generateCode(): string {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let code = "";

    for (let index = 0; index < 6; index += 1) {
      const randomIndex = Math.floor(Math.random() * alphabet.length);
      code += alphabet[randomIndex] ?? alphabet[0];
    }

    return code;
  }
}
