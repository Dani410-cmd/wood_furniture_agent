# aoooooooooontooooo
n = int(input())
l = list("anton")
for i in range(n):
    s = input()
    for j in s:
        if l and j == l[0]:
            del l[0]
    if l == "":
        print(i + 1, end=" ")
    l = "anton"
