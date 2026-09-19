//go:build linux

package updater

import (
	"errors"
	"os"
	"path/filepath"
	"syscall"
)

func secureOwner(path string) error {
	resolved := filepath.Clean(path)
	for {
		info, err := os.Lstat(resolved)
		if err != nil {
			return err
		}
		stat, ok := info.Sys().(*syscall.Stat_t)
		if !ok || stat.Uid != 0 || info.Mode().Perm()&0022 != 0 || info.Mode()&os.ModeSymlink != 0 {
			return errors.New("updater files and parent directories must be root-owned and not writable by other users")
		}
		parent := filepath.Dir(resolved)
		if parent == resolved {
			return nil
		}
		resolved = parent
	}
}
func syncParent(path string) error {
	dir, err := os.Open(filepath.Dir(path))
	if err != nil {
		return err
	}
	defer dir.Close()
	return dir.Sync()
}

func lock(path string) (func(), error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	if err = syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		f.Close()
		return nil, err
	}
	return func() { _ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN); _ = f.Close() }, nil
}
