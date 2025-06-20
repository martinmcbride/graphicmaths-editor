const source = String.raw`
  // An Ohm grammar for arithmetic expressions.

  Arithmetic {
    Exp
      = AssignExp

    AssignExp
      = variable "=" AddExp  -- assign
      | AddExp

    AddExp
      = AddExp "+" MulExp  -- plus
      | AddExp "-" MulExp  -- minus
      | MulExp

    MulExp
      = MulExp "*" ExpExp  -- times
      | MulExp "/" ExpExp  -- divide
      | ExpExp

    ExpExp
      = PriExp "^" ExpExp  -- power
      | PriExp

    PriExp
      = "(" Exp ")"  -- paren
      | "+" PriExp   -- pos
      | "-" PriExp   -- neg
      | ident "(" ListOf<Exp, ","> ")"   --call
      | ident
      | number

    /*
      The following rules have *descriptions*, which are optional parenthesized "comments" following
      the name of a rule in its declaration. Rule descriptions are used to produce better error
      messages when the input is not recognized.
    */
    variable  (a variable name)
      = letter alnum*

    ident  (an identifier)
      = letter alnum*

    number  (a number)
      = digit* "." digit+  -- fract
      | digit+             -- whole
  }
`;

const memory = {
  pi: { type: "NUM", value: Math.PI, mutable: false },
  sin: { type: "FUNC", fun: Math.sin, paramCount: 1 },
  cos: { type: "FUNC", fun: Math.cos, paramCount: 1 },
  sqrt: { type: "FUNC", fun: Math.sqrt, paramCount: 1 },
  hypot: { type: "FUNC", fun: Math.hypot, paramCount: 2 },
}


const grammar = ohm.grammar(source);
const semantics = grammar.createSemantics();

semantics.addOperation(
    'interpret',
    {
      Exp(e) {
        return e.interpret();  // Note that operations are accessed as methods on the CST nodes.
      },

      AssignExp(e) {
        return e.interpret();
      },

      AssignExp_assign(a, _, b) {
        variable = a.interpret();
        value = b.interpret();
        memory[variable] = { type: "NUM", value: value, mutable: true };
        return value;
      },
      AddExp(e) {
        return e.interpret();
      },
      AddExp_plus(x, _, y) {
        return x.interpret() + y.interpret();
      },
      AddExp_minus(x, _, y) {
        return x.interpret() - y.interpret();
      },
      MulExp(e)               { return e.interpret(); },
      MulExp_times(x, _, y)   { return x.interpret() * y.interpret(); },
      MulExp_divide(x, _, y)  { return x.interpret() / y.interpret(); },
      ExpExp(e)               { return e.interpret(); },
      ExpExp_power(x, _, y)   { return Math.pow(x.interpret(), y.interpret()); },
      PriExp(e)               { return e.interpret(); },
      PriExp_paren(_l, e, _r) { return e.interpret(); },
      PriExp_pos(_, e)        { return e.interpret(); },
      PriExp_neg(_, e)        { return -e.interpret(); },
      PriExp_call(id, _open, exps, _close){
        const entity = memory[id.sourceString]
        //must(entity !== undefined, `${id.sourceString} not defined`, id)
        //must(entity?.type === "FUNC", "Function expected", id)
        const args = exps.asIteration().children.map(e => e.interpret())
        //must(args.length === entity?.paramCount, "Wrong number of arguments", exps)
        return entity.fun(...args)
      },

      ident(_l, _ns) {
        // Look up the value of a constant, e.g., 'pi' or variable
        return memory[this.sourceString].value || 0;
      },
      number(_) {
        // Use `parseFloat` to convert (e.g.) the string '123' to the number 123.
        return parseFloat(this.sourceString);
      },
      variable(_l, _ns) {
        // Return the name of the variable
        return this.sourceString;
      }
    }
);
