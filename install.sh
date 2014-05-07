## Installation script for vim tutorial. Sets up a working directory, and installs a basic vimrc if none is found.

echo "Cloning vim-tutorial into $PWD/"
git clone https://github.com/refinery29/vim-tutorial

echo "Checking for vimrc..."
if [ -a $HOME/.vimrc ]; then
  echo "vimrc file found. Not adding any vimrc"
else
  echo "No vimrc found. Copying vimrc.example => $HOME/.vimrc"
  cp $PWD/vim-tutorial/vimrc.example $HOME/.vimrc
fi

echo "All done! cd into vim-tutorial/ to get started :)"
