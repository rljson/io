<!--
@license
Copyright (c) 2025 Rljson

Use of this source code is governed by terms that can be
found in the LICENSE file in the root of this package.
-->

# Ticket workflow

- [Checkout main](#checkout-main)
- [Define branch and PR name](#define-branch-and-pr-name)
- [Create a feature branch](#create-a-feature-branch)
- [Update dependencies](#update-dependencies)
- [Develop \& debug](#develop--debug)
- [Commit](#commit)
- [Increase version](#increase-version)
- [Run tests and build](#run-tests-and-build)
- [Rebase main](#rebase-main)
- [Create a pull request](#create-a-pull-request)
- [Code review](#code-review)
- [Delete feature branch](#delete-feature-branch)
- [Publish to NPM](#publish-to-npm)

## Checkout main

```bash
git checkout main
git fetch
git pull
```

## Define branch and PR name

In the _whole document_, replace the following things:

- `improve-publish-script` by the name of your new branch
- `Improve publish script` by your new pull request title

## Create a feature branch

```bash
git checkout -b improve-publish-script
```

## Update dependencies

```bash
pnpm update --latest
```

## Develop & debug

- [Debug & debug with Vscode](./debug-with-vscode.md)
- [Update Goldens](./update-goldens.md)
- [Rename classes](./rename-classes.md)
- [Super hero tricks](./super-hero.md)

## Commit

Use Vscode or another git client to commit your changes

If you have only one change, run

```bash
git add .
git commit -am"Improve publish script"
```

## Increase version

```bash
pnpm version patch --no-git-tag-version
git commit -am"Increase version"
```

## Run tests and build

```bash
npm run build
```

## Rebase main

```bash
git rebase main
```

## Create a pull request

```bash
git push -u origin improve-publish-script
gh pr create --base main --title "Improve publish script" --body " "
gh pr merge --auto --squash
```

## Code review

Read [setup-code-review.md](./code-review.md) on how to create a
code review.

## Check pull request status

```bash
 node scripts/wait-for-pr.js
```

## Delete feature branch

```bash
git fetch
git checkout main
git reset --soft origin/main
git stash -m"PR Aftermath"
git pull
git branch -d improve-publish-script
```

## Publish to NPM

```bash
node scripts/publish-to-npm.js
```
