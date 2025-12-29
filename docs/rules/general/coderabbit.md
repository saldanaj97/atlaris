# Running the CodeRabbit CLI

CodeRabbit is already installed in the terminal. If it is not notify the user.

When you are done with your changes, I want you to run: `coderabbit --prompt-only -t uncommitted` to review the changes, and then in an easy to copy .md format, I want you to give me all the suggested changes, with the file and line number, the description of the change, and (if it has one) the recommended prompt, as well as the suggested fix(if it does not have one just write none provided).

If code rabbit times out, then try again but with double the timeout than previously tried, e.g., if the previous timeout was 30s, try 60s next, if the previous timeout was 60s, try 120s next, and so on. The command will look like this: `coderabbit --prompt-only -t uncommitted --timeout 60s`.
