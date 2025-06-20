const source = String.raw`
  // An Ohm grammar for arithmetic expressions.

  Arithmetic {
    Exp
      = AddExp

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
      | ident
      | number

    /*
      The following rules have *descriptions*, which are optional parenthesized "comments" following
      the name of a rule in its declaration. Rule descriptions are used to produce better error
      messages when the input is not recognized. E.g., if you try to match the input "123" with the
      'ident' rule below, Ohm will say that "an identifier" was expected. Without ident's rule
      description, the error message would have said that "a letter" was expected -- which is true,
      but probably too low-level to be helpful. Note that 'letter', 'alnum', and 'digit' are built-in
      rules with their own descriptions (you can see their declarations in src/built-in-rules.ohm).
    */
    ident  (an identifier)
      = letter alnum*

    number  (a number)
      = digit* "." digit+  -- fract
      | digit+             -- whole
  }
`;

// We use `ohm.grammar` instantiate our Grammar from the source.
const g = ohm.grammar(source);


/*
  There are two kinds of rules in Ohm:

  * Lexical rules, whose names begin with a lower-case letter, and
  * Syntactic rules, whose names begin with an upper-case letter.

  The difference between lexical and syntactic rules is that syntactic rules implicitly skip
  whitespace characters. Here, a "whitespace character" is anything that matches the grammar's
  `space` rule. By default, you get a "vanilla" implementation of `space` that matches characters
  like ' ', '\t', '\n', '\r', etc., but you're free to override `space` to suit the language you're
  creating. (E.g., you may want it to consume comments, the syntax of which is up to you.)

  Here's the `PriExp` rule from our arithmetic grammar:

    PriExp
      = "(" Exp ")"
      | "+" PriExp
      | "-" PriExp
      | ident
      | number

  Because `PriExp` is a syntactic rule, it matches "spacey" inputs like the following example:
*/

g.match(' (  \t123   ) ', 'PriExp').succeeded();  // evaluates to `true`

/*
  Note that you can optionally specify a "start rule" of a match by passing its name as the 2nd
  argument to the `match` method, as shown above. When you don't specify a start rule, `match()`
  uses the grammar's *default start rule*, which is the first rule in the grammar's declaration.
  That's `Exp` for our arithmetic grammar.

  Anyway, without support for syntactic rules, rules like `PriExp` would have to skip whitespace
  characters explicitly, which can be tedious and error-prone, and often obscures the meaning of
  the rule. E.g., here is what the `PriExp` rule would look like if it weren't a syntactic rule:

    priExp
      = space* "(" exp space* ")"
      | space* "+" priExp
      | space* "-" priExp
      | space* ident
      | space* number

  Note that `exp` -- the lexical version of the `Exp` in our arithmetic grammar (not shown) -- would
  also have to skip whitespace characters explicitly.
*/

/*
  In Ohm, a grammar determines the set of all valid inputs / sentences in a language, but it doesn't
  specify what to do with valid inputs. To do something other than recognize valid inputs (e.g., to
  generate a parse tree or interpret a program) you first have to create a *semantics* for that
  grammar.

  A semantics is a family of *operations* and *attributes* for a given grammar. A grammar may have
  any number of semantics associated with it -- this means that the clients of a grammar (even in
  the same program) never have to worry about operation/attribute name clashes.

  Below, we create a new semantics `s` for our arithmetic grammar.
*/

const s = g.createSemantics();

/*
  But a semantics without any operations or attributes is not very interesting: it doesn't do
  anything! Let's add an operation to our semantics that can be used to evaluate the arithmetic
  expressions:
*/

const constants = {pi: Math.PI, e: Math.E};

s.addOperation(
    'interpret',
    /*
      When you create an operation, you have to specify what it does for each rule in the grammar.
      You do this by passing the `addOperation` method an "action dictionary": a plain old JS object
      that maps the names of the rules in the grammar to *semantic actions*, i.e., functions that
      specify what to do with that particular syntactic construct in the language. Here's the action
      dictionary of our new operation:
    */
    {
      /*
        The arguments of a semantic action are the *concrete syntax tree (CST) nodes* produced by
        the body of its corresponding rule. E.g., here's the `Exp` rule from our arithmetic grammar:

          Exp
            = AddExp

        The body of this rule consists of an application of the `AddExp` rule, which produces a
        single CST node. Our semantic action for `Exp` will take this CST node as its only argument.

        (When you create a new operation / attribute, Ohm checks the arities of all of its semantic
        actions against their corresponding grammar rules -- this makes programming operations /
        attributes much less error-prone. More on this later.)

        Since the result of interpreting an `Exp` should be the same as the result of interpreting
        its enclosed "add expression", we write:
      */
      Exp(e) {
        return e.interpret();  // Note that operations are accessed as methods on the CST nodes.
      },

      /*
        Next, we look at `AddExp`:

          AddExp
            = AddExp "+" MulExp
            | AddExp "-" MulExp
            | MulExp

        The body of this rule is a disjunction (an "OR") of three parsing expressions. The first of
        these expressions,

          AddExp "+" MulExp

        will produce 3 CST nodes if it successfully matches the input: one for the `AddExp`
        application, one for the terminal "+", and another for the `MulExp` application. Likewise,
        the second choice,

          AddExp "-" MulExp

        will also produce 3 CST nodes on a successful match. The third choice, however,

          MulExp

        produces only 1 CST node. This mismatch would be problematic for someone who is trying to
        write a semantic action for `AddExp`: How many arguments should that semantic action take?
        Maybe it should depend on which choice succeeded? No, it turns out this wouldn't be such a
        good idea. For one thing, it would make the programmer's life more difficult (e.g., she
        would have to branch on the value of `arguments.length`). Worse, it would make it impossible
        for Ohm to check the arities of semantic actions at operation / attribute creation time,
        which would in turn make programming with Ohm error-prone.

        To avoid these problems, Ohm requires all of the operands in a disjunction

          e_1 | e_2 | ... | e_n

        to have the same *arity*, i.e., to produce the same number of CST nodes. In fact, the
        declaration of `AddExp`, as shown above, would result in a compile-time error -- namely,
        the call to `ohm.grammar()` would throw an exception.

        We can fix this by refactoring the first two choices of `AddExp` into their own rules:

          AddExp
            = AddExp_plus
            | AddExp_minus
            | MulExp

          AddExp_plus
            = AddExp "+" MulExp

          AddExp_minus
            = AddExp "-" MulExp

        Now `AddExp` has arity 1, and both `AddExp_plus` and `AddExp_minus` have arity 3, and
        everything is consistent.

        The downside of this refactoring is that it has made our grammar more verbose. Fortunately,
        Ohm provides a syntactic sugar for this common construction: it's called an *inline rule
        declaration*. When you write this (notice the *case labels* `plus` and `minus`, which look
        like comments in Haskell):

          AddExp
            = AddExp "+" MulExp  -- plus
            | AddExp "-" MulExp  -- minus
            | MulExp

        the expression to the left of each `--` becomes the body of a new rule whose name is the
        name of the original rule concatenated with an underscore and the case label:

          AddExp
            = AddExp_plus
            | AddExp_minus
            | MulExp

          AddExp_plus
            = AddExp "+" MulExp

          (Similarly for AddExp_minus)

        Now it's straightforward to write the semantic actions for `AddExp`, `AddExp_plus`, and
        `AddExp_minus`:
      */
      AddExp(e) {
        return e.interpret();
      },
      AddExp_plus(x, _, y) {
        return x.interpret() + y.interpret();
      },
      AddExp_minus(x, _, y) {
        return x.interpret() - y.interpret();
      },

      /*
        The following semantic actions are more of the same...
      */
      MulExp(e)               { return e.interpret(); },
      MulExp_times(x, _, y)   { return x.interpret() * y.interpret(); },
      MulExp_divide(x, _, y)  { return x.interpret() / y.interpret(); },
      ExpExp(e)               { return e.interpret(); },
      ExpExp_power(x, _, y)   { return Math.pow(x.interpret(), y.interpret()); },
      PriExp(e)               { return e.interpret(); },
      PriExp_paren(_l, e, _r) { return e.interpret(); },
      PriExp_pos(_, e)        { return e.interpret(); },
      PriExp_neg(_, e)        { return -e.interpret(); },

      /*
        CST nodes have a couple of useful properties which contain information about where that
        node "came from" in the input:

        * `aNode.sourceString` contains the substring of the input that was consumed by the
          node.

        * `aNode.source.startIdx` and `aNode.source.endIdx` give the position of the source
          string in the original input.

        We use `this.sourceString` in the two rules below to interpret identifiers and numbers.
        (In a semantic action for a rule R, `this` is bound to the CST node that was produced by R.
        In other words, `this` is the parent of each of the CST nodes that are passed as arguments
        to the semantic action.)
      */
      ident(_l, _ns) {
        // Look up the value of a named constant, e.g., 'pi'.
        return constants[this.sourceString] || 0;
      },
      number(_) {
        // Use `parseFloat` to convert (e.g.) the string '123' to the number 123.
        return parseFloat(this.sourceString);
      }
    }
);
