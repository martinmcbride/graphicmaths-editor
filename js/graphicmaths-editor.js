const myGrammar = ohm.grammar(String.raw`
  MyGrammar {
    greeting = "Hello" | "Hola"
  }
`);