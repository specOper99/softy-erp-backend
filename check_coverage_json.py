
import json
import sys

def check_coverage():
    try:
        with open('coverage/coverage-final.json', 'r') as f:
            data = json.load(f)
    except FileNotFoundError:
        print("Coverage file not found.")
        return

    failed_files = []

    for file_path, coverage in data.items():
        # Iterate over all metrics
        metrics = ['s', 'b', 'f', 'l'] # statements, branches, functions, lines
        
        is_perfect = True
        details = []
        
        # Calculate statement coverage
        s_total = len(coverage['s'])
        s_covered = sum(1 for v in coverage['s'].values() if v > 0)
        if s_total > 0 and s_covered < s_total:
             is_perfect = False
             details.append(f"Statements: {s_covered}/{s_total}")

        # Calculate branch coverage
        # structure is 'b': { '0': [taken, total], ... } 
        # Wait, istanbul format for branches is 'b': { '0': [count_branch_0, count_branch_1], ... }
        # count > 0 means covered.
        b_total = 0
        b_covered = 0
        for b_counts in coverage['b'].values():
            b_total += len(b_counts)
            b_covered += sum(1 for c in b_counts if c > 0)
            
        if b_total > 0 and b_covered < b_total:
             is_perfect = False
             details.append(f"Branches: {b_covered}/{b_total}")

        # Calculate function coverage
        f_total = len(coverage['f'])
        f_covered = sum(1 for v in coverage['f'].values() if v > 0)
        if f_total > 0 and f_covered < f_total:
             is_perfect = False
             details.append(f"Functions: {f_covered}/{f_total}")

        if not is_perfect:
            # Flatten path for display
            short_path = file_path.split('backend/')[-1]
            failed_files.append(f"{short_path}: {', '.join(details)}")

    if failed_files:
        print("Files with < 100% coverage:")
        for line in failed_files:
            print(line)
        sys.exit(1)
    else:
        print("All files have 100% coverage!")

if __name__ == "__main__":
    check_coverage()
